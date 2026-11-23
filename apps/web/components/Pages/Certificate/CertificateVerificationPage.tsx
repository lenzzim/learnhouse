'use client';

import React, { useEffect, useState } from 'react';
import { getCertificateByUuid } from '@services/courses/certifications';
import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview';
import { Shield, CheckCircle, XCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getUriWithOrg, getAbsoluteUriWithOrg } from '@services/config/config';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { useOrg } from '@components/Contexts/OrgContext';
import { useTrackView, AnalyticsEvent } from '@services/analytics';
import { useTranslation } from 'react-i18next';

interface CertificateVerificationPageProps {
  certificateUuid: string;
}

const CertificateVerificationPage: React.FC<CertificateVerificationPageProps> = ({ certificateUuid }) => {
  const [certificateData, setCertificateData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'valid' | 'invalid' | 'loading'>('loading');
  const org = useOrg() as any;
  const { t, i18n } = useTranslation();
  const idioma = i18n?.language || 'pt-BR';

  useTrackView(AnalyticsEvent.CertificateVerificationViewed, { verification_status: verificationStatus }, !isLoading);

  // Fetch certificate data
  useEffect(() => {
    const fetchCertificate = async () => {
      if (!org?.id) {
        return; // Wait for org to be available
      }

      try {
        const result = await getCertificateByUuid(certificateUuid, org.id);

        if (result.success && result.data) {
          setCertificateData(result.data);
          setVerificationStatus('valid');
        } else {
          setError(t('certificate.verificacao.nao_encontrado'));
          setVerificationStatus('invalid');
        }
      } catch (error) {
        console.error('Error fetching certificate:', error);
        setError(t('certificate.verificacao.erro_verificar'));
        setVerificationStatus('invalid');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCertificate();
  }, [certificateUuid, org?.id]);

  const getVerificationStatusIcon = () => {
    switch (verificationStatus) {
      case 'valid':
        return <CheckCircle className="w-6 h-6 text-[var(--text)]" />;
      case 'invalid':
        return <XCircle className="w-6 h-6 text-[var(--text-2)]" />;
      case 'loading':
        return <AlertTriangle className="w-6 h-6 text-[var(--text-3)]" />;
      default:
        return <AlertTriangle className="w-6 h-6 text-[var(--text-3)]" />;
    }
  };

  const getVerificationStatusText = () => {
    switch (verificationStatus) {
      case 'valid':
        return t('certificate.verificacao.status_valido');
      case 'invalid':
        return t('certificate.verificacao.nao_encontrado');
      case 'loading':
        return t('certificate.verificacao.status_verificando');
      default:
        return t('certificate.verificacao.status_verificando');
    }
  };

  const getVerificationStatusColor = () => {
    switch (verificationStatus) {
      case 'valid':
        return 'text-[var(--text)] bg-[var(--surface)] border-[var(--line-strong)]';
      case 'invalid':
        return 'text-[var(--text-2)] bg-[var(--surface)] border-[var(--line-strong)]';
      case 'loading':
        return 'text-[var(--text-3)] bg-[var(--surface)] border-[var(--line)]';
      default:
        return 'text-[var(--text-3)] bg-[var(--surface)] border-[var(--line)]';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--page)]">
        <div className="bg-[var(--panel)] rounded-2xl p-8 nice-shadow max-w-4xl w-full space-y-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--text)]"></div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('certificate.verificacao.verificando_titulo')}</h1>
            <p className="text-[var(--text-2)]">{t('certificate.verificacao.verificando_texto')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || verificationStatus === 'invalid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--page)]">
        <div className="bg-[var(--panel)] rounded-2xl p-8 nice-shadow max-w-2xl w-full space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="bg-[var(--surface)] p-4 rounded-full">
              <XCircle className="w-16 h-16 text-[var(--text-2)]" />
            </div>
            
            <h1 className="text-3xl font-bold text-[var(--text)] text-center">
              {t('certificate.verificacao.nao_encontrado')}
            </h1>
            
            <p className="text-[var(--text-2)] text-center">
              {t('certificate.verificacao.nao_encontrado_texto')}{' '}<span className="font-mono bg-[var(--surface)] px-2 py-1 rounded break-all">{certificateUuid}</span>
            </p>
            
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-4 w-full">
              <p className="text-[var(--text)] text-sm">
                {t('certificate.verificacao.pode_significar')}
              </p>
              <ul className="text-[var(--text-2)] text-sm mt-2 list-disc list-inside space-y-1">
                <li>{t('certificate.verificacao.motivo_codigo')}</li>
                <li>{t('certificate.verificacao.motivo_revogado')}</li>
                <li>{t('certificate.verificacao.motivo_expirado')}</li>
                <li>{t('certificate.verificacao.motivo_outra_org')}</li>
              </ul>
            </div>
            
            <div className="pt-4">
              <Link
                href="/"
                className="inline-flex items-center space-x-2 bg-[var(--cta-bg)] text-[var(--cta-fg)] px-6 py-3 rounded-full hover:bg-[var(--cta-bg-hover)] transition duration-200"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>{t('certificate.verificacao.voltar_inicio')}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!certificateData) {
    return null;
  }

  // Absolute: encoded in the QR code and copied out of the app, so it must carry the host
  const qrCodeLink = getAbsoluteUriWithOrg(org?.org_slug || '', `/certificates/${certificateData.certificate_user.user_certification_uuid}/verify`);

  return (
    <div className="min-h-screen bg-[var(--page)] py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="bg-[var(--panel)] rounded-2xl p-6 mb-8 nice-shadow">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-[var(--surface)] p-3 rounded-full">
                <Shield className="w-8 h-8 text-[var(--text)]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--text)]">{t('certificate.verificacao.titulo')}</h1>
                <p className="text-[var(--text-2)]">{t('certificate.verificacao.subtitulo')}</p>
              </div>
            </div>
            
            <div className={`flex items-center space-x-3 px-4 py-2 rounded-full border ${getVerificationStatusColor()}`}>
              {getVerificationStatusIcon()}
              <span className="font-semibold">{getVerificationStatusText()}</span>
            </div>
          </div>
        </div>

        {/* Certificate Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Certificate Preview and Course Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Certificate Preview */}
            <div className="bg-[var(--panel)] rounded-2xl p-6 nice-shadow">
              <h2 className="text-xl font-semibold text-[var(--text)] mb-4">{t('certificate.verificacao.previa')}</h2>
              <div className="max-w-2xl mx-auto" id="certificate-preview">
                <CertificatePreview
                  certificationName={certificateData.certification.config.certification_name}
                  certificationDescription={certificateData.certification.config.certification_description}
                  certificationType={certificateData.certification.config.certification_type}
                  certificatePattern={certificateData.certification.config.certificate_pattern}
                  certificateInstructor={certificateData.certification.config.certificate_instructor}
                  certificateId={certificateData.certificate_user.user_certification_uuid}
                  awardedDate={new Date(certificateData.certificate_user.created_at).toLocaleDateString(idioma, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                  qrCodeLink={qrCodeLink}
                />
              </div>
            </div>

            {/* Course Information */}
            <div className="bg-[var(--panel)] shadow-md shadow-gray-300/25 outline outline-1 outline-neutral-200/40 rounded-lg overflow-hidden p-4">
              <div className="flex items-start space-x-4">
                {/* Course Thumbnail */}
                <div className="flex-shrink-0">
                  <div className="w-20 h-12 bg-gray-100 rounded-lg overflow-hidden ring-1 ring-inset ring-black/10">
                    {certificateData.course.thumbnail_image ? (
                      <img
                        src={getCourseThumbnailMediaDirectory(
                          org?.org_uuid,
                          certificateData.course.course_uuid,
                          certificateData.course.thumbnail_image
                        )}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* Course Details */}
                <div className="flex-1 min-w-0">
                  <div className="space-y-1">
                    <div>
                      <h4 className="font-semibold text-[var(--text)] text-base leading-tight">{certificateData.course.name}</h4>
                      {certificateData.course.description && (
                        <p className="text-sm text-[var(--text-2)] line-clamp-2 mt-1">{certificateData.course.description}</p>
                      )}
                    </div>

                    {certificateData.course.authors && certificateData.course.authors.length > 0 && (
                      <div className="flex items-center space-x-1 text-sm text-neutral-400 font-normal">
                        <span>{t('certificate.verificacao.por')}</span>
                        <div className="flex items-center space-x-1">
                          {certificateData.course.authors
                            .filter((author: any) => author.authorship_status === 'ACTIVE')
                            .slice(0, 2)
                            .map((author: any, index: number) => (
                              <span key={author.user.user_uuid} className="text-neutral-600">
                                {author.user.first_name} {author.user.last_name}
                                {index < Math.min(2, certificateData.course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length - 1) && ', '}
                              </span>
                            ))}
                          {certificateData.course.authors.filter((author: any) => author.authorship_status === 'ACTIVE').length > 2 && (
                            <span className="text-neutral-400">
                              +{certificateData.course.authors.filter((author: any) => author.authorship_status === 'ACTIVE').length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* View Course Link */}
                <div className="flex-shrink-0">
                  <Link
                    href={getUriWithOrg(org?.org_slug || '', `/course/${certificateData.course.course_uuid.replace('course_', '')}`)}
                    className="inline-flex items-center space-x-1 text-neutral-400 hover:text-neutral-600 transition-colors text-sm"
                  >
                    <span>{t('certificate.verificacao.ver_curso')}</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Certificate Details */}
          <div className="space-y-6">
            <div className="bg-[var(--panel)] rounded-2xl p-6 nice-shadow">
              <h2 className="text-xl font-semibold text-[var(--text)] mb-4">{t('certificate.verificacao.informacoes')}</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">{t('certificate.verificacao.codigo')}</label>
                  <div className="bg-[var(--page)] p-3 rounded-lg">
                    <code className="text-sm text-[var(--text)] break-all">
                      {certificateData.certificate_user.user_certification_uuid}
                    </code>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">{t('certificate.verificacao.curso')}</label>
                  <div className="bg-[var(--page)] p-3 rounded-lg">
                    <span className="text-[var(--text)]">{certificateData.course.name}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">{t('certificate.verificacao.tipo')}</label>
                  <div className="bg-[var(--page)] p-3 rounded-lg">
                    <span className="text-[var(--text)] capitalize">
                      {t(`certificate.arte.tipo_${certificateData.certification.config.certification_type}`, { defaultValue: certificateData.certification.config.certification_type.replace('_', ' ') })}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">{t('certificate.verificacao.data')}</label>
                  <div className="bg-[var(--page)] p-3 rounded-lg">
                    <span className="text-[var(--text)]">
                      {new Date(certificateData.certificate_user.created_at).toLocaleDateString(idioma, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>

                {certificateData.certification.config.certificate_instructor && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-2)] mb-1">{t('certificate.arte.instrutor')}</label>
                    <div className="bg-[var(--page)] p-3 rounded-lg">
                      <span className="text-[var(--text)]">{certificateData.certification.config.certificate_instructor}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-6">
              <div className="flex items-center space-x-3 mb-3">
                <Shield className="w-6 h-6 text-[var(--text)]" />
                <h3 className="text-lg font-semibold text-[var(--text)]">{t('certificate.verificacao.seguranca')}</h3>
              </div>
              <ul className="text-[var(--text-2)] text-sm space-y-2">
                <li>• {t('certificate.verificacao.seg_1')}</li>
                <li>• {t('certificate.verificacao.seg_2')}</li>
                <li>• {t('certificate.verificacao.seg_3')}</li>
                <li>• {t('certificate.verificacao.seg_4')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 bg-[var(--cta-bg)] text-[var(--cta-fg)] px-6 py-3 rounded-full hover:bg-[var(--cta-bg-hover)] transition duration-200"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('certificate.verificacao.voltar_inicio')}</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CertificateVerificationPage; 