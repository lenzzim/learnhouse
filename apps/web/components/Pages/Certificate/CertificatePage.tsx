'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useLHSession } from '@components/Contexts/LHSessionContext';
import { useOrg } from '@components/Contexts/OrgContext';
import { getUserCertificates } from '@services/courses/certifications';
import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview';
import { ArrowLeft, Download, Share2, Copy, Check } from 'lucide-react';
import Link from 'next/link';
import { getUriWithOrg } from '@services/config/config';
import { useLHAnalytics, useTrackView, AnalyticsEvent } from '@services/analytics';
import {
  CERTIFICATE_CAPTURE_WIDTH,
  certificateFileName,
  downloadCertificateNodeAsPdf,
} from '@services/courses/certificateDownload';
import { useTranslation } from 'react-i18next';

interface CertificatePageProps {
  orgslug: string;
  courseid: string;
  qrCodeLink: string;
}

const CertificatePage: React.FC<CertificatePageProps> = ({ orgslug, courseid, qrCodeLink }) => {
  const session = useLHSession() as any;
  const org = useOrg() as any;
  const [userCertificate, setUserCertificate] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const certificateCaptureRef = useRef<HTMLDivElement>(null);
  const { track } = useLHAnalytics('learner');
  const { t, i18n } = useTranslation();
  const idioma = i18n?.language || 'pt-BR';

  useTrackView(AnalyticsEvent.CertificateViewed, {}, !!userCertificate);

  // Recipient's display name for the certificate. Falls back through
  // full name -> username -> the session user, and is empty when unknown so
  // the "Presented to" line simply doesn't render.
  const getLearnerName = (): string => {
    const u = userCertificate?.user;
    const full = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
    if (full) return full;
    if (u?.username) return u.username;
    const s = session?.data?.user;
    const sessionFull = [s?.first_name, s?.last_name].filter(Boolean).join(' ').trim();
    return sessionFull || s?.username || '';
  };
  const learnerName = getLearnerName();

  // Fetch user certificate
  useEffect(() => {
    const fetchCertificate = async () => {
      if (!session?.data?.tokens?.access_token) {
        setError(t('certificate.pagina.login_necessario'));
        setIsLoading(false);
        return;
      }

      if (!org?.id) {
        return; // Wait for org to be available
      }

      try {
        const cleanCourseId = courseid.replace('course_', '');
        const result = await getUserCertificates(
          `course_${cleanCourseId}`,
          org.id,
          session.data.tokens.access_token
        );

        if (result.success && result.data && result.data.length > 0) {
          setUserCertificate(result.data[0]);
        } else {
          setError(t('certificate.pagina.sem_certificado_curso'));
        }
      } catch (error) {
        console.error('Error fetching certificate:', error);
        setError(t('certificate.pagina.erro_carregar'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchCertificate();
  }, [courseid, session?.data?.tokens?.access_token, org?.id]);



  // Single source of truth for the certificate's contents. Both the visible
  // certificate and the offscreen one we rasterise into the PDF are rendered
  // from this, so they cannot drift apart.
  const certificatePreviewProps = useMemo(() => {
    if (!userCertificate) return null;
    const config = userCertificate.certification?.config || {};
    return {
      certificationName: config.certification_name,
      certificationDescription: config.certification_description,
      certificationType: config.certification_type,
      certificatePattern: config.certificate_pattern,
      certificateInstructor: config.certificate_instructor,
      certificateId: userCertificate.certificate_user.user_certification_uuid,
      learnerName,
      awardedDate: new Date(userCertificate.certificate_user.created_at).toLocaleDateString(idioma, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      qrCodeLink,
    };
  }, [userCertificate, learnerName, qrCodeLink, idioma]);

  // Generate the PDF from the SAME <CertificatePreview> the learner sees.
  //
  // This used to build its own certificate out of a hand-written HTML string,
  // which had drifted into a different design: no pattern artwork, no org logo
  // or name, an emoji instead of the award mark, Arial instead of the app's
  // type. We now rasterise a hidden, fixed-width render of the real component
  // (`certificateCaptureRef` below), the same way CourseEndView does, so the
  // download always matches the certificate on screen.
  const downloadCertificate = async () => {
    if (!userCertificate) return;
    const node = certificateCaptureRef.current;
    if (!node) return;

    try {
      await downloadCertificateNodeAsPdf(
        node,
        certificateFileName(userCertificate.certification?.config?.certification_name),
      );

      track(AnalyticsEvent.CertificateDownloaded, {
        certification_type: userCertificate.certification.config.certification_type,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error(t('certificate.download_failed'));
    }
  };

  // Open LinkedIn's "Add to Profile" flow, pre-filled with the certificate details
  const shareToLinkedIn = () => {
    if (!userCertificate) return;

    const config = userCertificate.certification.config;
    const awardedAt = new Date(userCertificate.certificate_user.created_at);

    const params = new URLSearchParams({
      startTask: 'CERTIFICATION_NAME',
      name: config.certification_name,
      organizationName: org?.name || '',
      issueYear: String(awardedAt.getFullYear()),
      issueMonth: String(awardedAt.getMonth() + 1),
      certId: userCertificate.certificate_user.user_certification_uuid,
      certUrl: qrCodeLink,
    });

    window.open(
      `https://www.linkedin.com/profile/add?${params.toString()}`,
      '_blank',
      'noopener,noreferrer'
    );

    track(AnalyticsEvent.CertificateSharedLinkedin, {
      certification_name: config.certification_name,
    });
  };

  // Copy the public certificate verification link to the clipboard
  const copyVerificationLink = async () => {
    if (!qrCodeLink) return;

    try {
      await navigator.clipboard.writeText(qrCodeLink);
      setLinkCopied(true);
      toast.success(t('certificate.pagina.link_copiado'));
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error('Error copying verification link:', error);
      toast.error(t('certificate.pagina.falha_copiar'));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--text)] mx-auto mb-4"></div>
          <p className="text-[var(--text-2)]">{t('certificate.loading_certificate')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[var(--text)] mb-2">{t('certificate.pagina.indisponivel')}</h2>
            <p className="text-[var(--text-2)] mb-4">{error}</p>
            <Link
              href={getUriWithOrg(orgslug, '') + `/course/${courseid}`}
              className="inline-flex items-center space-x-2 bg-[var(--cta-bg)] text-[var(--cta-fg)] px-6 py-3 rounded-full hover:bg-[var(--cta-bg-hover)] transition duration-200"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>{t('certificate.pagina.voltar_curso')}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!userCertificate) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[var(--text)] mb-2">{t('certificate.pagina.nenhum')}</h2>
            <p className="text-[var(--text-2)] mb-4">
              {t('certificate.no_certificate_available')}
            </p>
            <Link
              href={getUriWithOrg(orgslug, '') + `/course/${courseid}`}
              className="inline-flex items-center space-x-2 bg-[var(--cta-bg)] text-[var(--cta-fg)] px-6 py-3 rounded-full hover:bg-[var(--cta-bg-hover)] transition duration-200"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>{t('certificate.pagina.voltar_curso')}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page)] py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between mb-8">
          <Link
            href={getUriWithOrg(orgslug, '') + `/course/${courseid}`}
            className="inline-flex items-center space-x-2 text-[var(--text-2)] hover:text-[var(--text)] transition duration-200"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('certificate.pagina.voltar_curso')}</span>
          </Link>
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={copyVerificationLink}
              aria-label={t('certificate.pagina.copiar_link_aria')}
              className="inline-flex items-center space-x-2 bg-[var(--surface)] text-[var(--text)] border border-[var(--line)] px-5 py-3 rounded-full hover:bg-[var(--line)] transition duration-200"
            >
              {linkCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              <span>{linkCopied ? t('certificate.pagina.copiado') : t('certificate.pagina.copiar_link')}</span>
            </button>
            <button
              onClick={shareToLinkedIn}
              aria-label={t('certificate.pagina.linkedin_aria')}
              className="inline-flex items-center space-x-2 bg-[var(--surface)] text-[var(--text)] border border-[var(--line-strong)] px-5 py-3 rounded-full hover:bg-[var(--line)] transition duration-200"
            >
              <Share2 className="w-5 h-5" />
              <span>{t('certificate.pagina.linkedin')}</span>
            </button>
            <button
              onClick={downloadCertificate}
              aria-label={t('certificate.pagina.baixar_aria')}
              className="inline-flex items-center space-x-2 bg-[var(--cta-bg)] text-[var(--cta-fg)] px-5 py-3 rounded-full hover:bg-[var(--cta-bg-hover)] transition duration-200"
            >
              <Download className="w-5 h-5" />
              <span>{t('certificate.pagina.baixar_pdf')}</span>
            </button>
          </div>
        </div>

        {/* Certificate Display */}
        <div className="bg-[var(--panel)] rounded-2xl shadow-lg p-8">
          <div className="max-w-2xl mx-auto">
            {certificatePreviewProps && <CertificatePreview {...certificatePreviewProps} />}
          </div>
        </div>

        {/* PDF source. Identical props to the visible certificate above, just
            pinned to a fixed width so the export is the same on every screen.
            Kept in the layout (offscreen, not display:none) because html2canvas
            cannot measure a hidden subtree. */}
        {certificatePreviewProps && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed top-0 start-0 -z-50 opacity-0"
            style={{ transform: 'translateX(-200vw)' }}
          >
            <div ref={certificateCaptureRef} style={{ width: CERTIFICATE_CAPTURE_WIDTH }}>
              <CertificatePreview {...certificatePreviewProps} />
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 text-center text-[var(--text-2)]">
          <p className="mb-2">
            {t('certificate.pagina.instrucao_1')}
          </p>
          <p className="text-sm">
            {t('certificate.pagina.instrucao_2')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CertificatePage; 