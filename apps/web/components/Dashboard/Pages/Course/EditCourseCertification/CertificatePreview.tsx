import React, { useEffect, useState } from 'react';
import { Award, CheckCircle, QrCode, Building, User, Calendar, Hash } from 'lucide-react';
import { useOrg } from '@components/Contexts/OrgContext';
import { getOrgLogoMediaDirectory } from '@services/media/media';
import { useTranslation } from 'react-i18next';

interface CertificatePreviewProps {
  certificationName: string;
  certificationDescription: string;
  certificationType: string;
  certificatePattern: string;
  certificateInstructor?: string;
  certificateId?: string;
  awardedDate?: string;
  qrCodeLink?: string;
  // The recipient's name. Optional so the admin editor preview (which has no
  // learner) renders unchanged; only shown when a name is provided.
  learnerName?: string;
}

const CertificatePreview: React.FC<CertificatePreviewProps> = ({
  certificationName,
  certificationDescription,
  certificationType,
  certificatePattern,
  certificateInstructor,
  certificateId,
  awardedDate,
  qrCodeLink,
  learnerName
}) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const org = useOrg() as any;
  const { t } = useTranslation();

  // Generate QR code
  useEffect(() => {
    const generateQRCode = async () => {
      try {
        const certificateData = qrCodeLink || `${certificateId}`;
        const QRCode = (await import('qrcode')).default;
        const qrUrl = await QRCode.toDataURL(certificateData, {
          width: 185,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          errorCorrectionLevel: 'M',
          type: 'image/png'
        });
        setQrCodeUrl(qrUrl);
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };

    generateQRCode();
  }, [certificateId, qrCodeLink]);
  // Function to get theme colors for each pattern
  const getPatternTheme = (pattern: string) => {
    switch (pattern) {
      case 'royal':
        return {
          primary: 'text-neutral-700',
          secondary: 'text-neutral-600',
          icon: 'text-neutral-600',
          badge: 'bg-neutral-50 text-neutral-700 border-neutral-200'
        };
      case 'tech':
        return {
          primary: 'text-neutral-700',
          secondary: 'text-neutral-600',
          icon: 'text-neutral-600',
          badge: 'bg-neutral-50 text-neutral-700 border-neutral-200'
        };
      case 'nature':
        return {
          primary: 'text-neutral-700',
          secondary: 'text-neutral-600',
          icon: 'text-neutral-600',
          badge: 'bg-neutral-50 text-neutral-700 border-neutral-200'
        };
      case 'geometric':
        return {
          primary: 'text-neutral-700',
          secondary: 'text-neutral-600',
          icon: 'text-neutral-600',
          badge: 'bg-neutral-50 text-neutral-700 border-neutral-200'
        };
      case 'vintage':
        return {
          primary: 'text-neutral-700',
          secondary: 'text-neutral-600',
          icon: 'text-neutral-600',
          badge: 'bg-neutral-50 text-neutral-700 border-neutral-200'
        };
      case 'waves':
        return {
          primary: 'text-neutral-700',
          secondary: 'text-neutral-600',
          icon: 'text-neutral-600',
          badge: 'bg-neutral-50 text-neutral-700 border-neutral-200'
        };
      case 'minimal':
        return {
          primary: 'text-gray-700',
          secondary: 'text-gray-600',
          icon: 'text-gray-600',
          badge: 'bg-gray-50 text-gray-700 border-gray-200'
        };
      case 'professional':
        return {
          primary: 'text-neutral-700',
          secondary: 'text-neutral-600',
          icon: 'text-neutral-600',
          badge: 'bg-neutral-50 text-neutral-700 border-neutral-200'
        };
      case 'academic':
        return {
          primary: 'text-neutral-700',
          secondary: 'text-neutral-600',
          icon: 'text-neutral-600',
          badge: 'bg-neutral-50 text-neutral-700 border-neutral-200'
        };
      case 'modern':
        return {
          primary: 'text-neutral-700',
          secondary: 'text-neutral-600',
          icon: 'text-neutral-600',
          badge: 'bg-neutral-50 text-neutral-700 border-neutral-200'
        };
      default:
        return {
          primary: 'text-gray-700',
          secondary: 'text-gray-600',
          icon: 'text-gray-600',
          badge: 'bg-gray-50 text-gray-700 border-gray-200'
        };
    }
  };

  // Function to render different certificate patterns
  const renderCertificatePattern = (pattern: string) => {
    switch (pattern) {
      case 'royal':
        return (
          <>
            {/* Royal ornate border with crown elements */}
            <div className="absolute inset-3 border-4 border-neutral-200 rounded-lg opacity-60"></div>
            <div className="absolute inset-4 border-2 border-neutral-300 rounded-md opacity-40"></div>
            
            {/* Crown-like decorations in corners */}
            <div className="absolute top-1 left-1/2 transform -translate-x-1/2">
              <div className="w-8 h-4 bg-neutral-200 opacity-50" style={{
                clipPath: 'polygon(0% 100%, 20% 0%, 40% 100%, 60% 0%, 80% 100%, 100% 0%, 100% 100%)'
              }}></div>
            </div>
            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 rotate-180">
              <div className="w-8 h-4 bg-neutral-200 opacity-50" style={{
                clipPath: 'polygon(0% 100%, 20% 0%, 40% 100%, 60% 0%, 80% 100%, 100% 0%, 100% 100%)'
              }}></div>
            </div>
            
            {/* Royal background pattern */}
            <div className="absolute inset-0 opacity-3">
              <div className="w-full h-full" style={{
                backgroundImage: `radial-gradient(circle at 25% 25%, #737373 2px, transparent 2px), radial-gradient(circle at 75% 75%, #737373 1px, transparent 1px)`,
                backgroundSize: '16px 16px'
              }}></div>
            </div>
          </>
        );
      
      case 'tech':
        return (
          <>
            {/* Tech circuit board borders */}
            <div className="absolute inset-3 border-2 border-neutral-200 opacity-50"></div>
            
            {/* Circuit-like corner elements */}
            <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-neutral-300 opacity-60"></div>
            <div className="absolute top-3 left-5 w-2 h-2 bg-neutral-300 opacity-60"></div>
            <div className="absolute top-5 left-3 w-2 h-2 bg-neutral-300 opacity-60"></div>
            
            <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-neutral-300 opacity-60"></div>
            <div className="absolute top-3 right-5 w-2 h-2 bg-neutral-300 opacity-60"></div>
            <div className="absolute top-5 right-3 w-2 h-2 bg-neutral-300 opacity-60"></div>
            
            <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-neutral-300 opacity-60"></div>
            <div className="absolute bottom-3 left-5 w-2 h-2 bg-neutral-300 opacity-60"></div>
            <div className="absolute bottom-5 left-3 w-2 h-2 bg-neutral-300 opacity-60"></div>
            
            <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-neutral-300 opacity-60"></div>
            <div className="absolute bottom-3 right-5 w-2 h-2 bg-neutral-300 opacity-60"></div>
            <div className="absolute bottom-5 right-3 w-2 h-2 bg-neutral-300 opacity-60"></div>
            
            {/* Tech grid background */}
            <div className="absolute inset-0 opacity-4">
              <div className="w-full h-full" style={{
                backgroundImage: `linear-gradient(90deg, #737373 1px, transparent 1px), linear-gradient(0deg, #737373 1px, transparent 1px)`,
                backgroundSize: '8px 8px'
              }}></div>
            </div>
          </>
        );
      
      case 'nature':
        return (
          <>
            {/* Nature organic border */}
            <div className="absolute inset-3 border-2 border-neutral-200 rounded-2xl opacity-50"></div>
            
            {/* Leaf-like decorations */}
            <div className="absolute top-2 left-2 w-4 h-6 bg-neutral-200 opacity-50 rounded-full transform rotate-45"></div>
            <div className="absolute top-2 left-4 w-3 h-4 bg-neutral-300 opacity-40 rounded-full transform rotate-12"></div>
            
            <div className="absolute top-2 right-2 w-4 h-6 bg-neutral-200 opacity-50 rounded-full transform -rotate-45"></div>
            <div className="absolute top-2 right-4 w-3 h-4 bg-neutral-300 opacity-40 rounded-full transform -rotate-12"></div>
            
            <div className="absolute bottom-2 left-2 w-4 h-6 bg-neutral-200 opacity-50 rounded-full transform -rotate-45"></div>
            <div className="absolute bottom-2 left-4 w-3 h-4 bg-neutral-300 opacity-40 rounded-full transform -rotate-12"></div>
            
            <div className="absolute bottom-2 right-2 w-4 h-6 bg-neutral-200 opacity-50 rounded-full transform rotate-45"></div>
            <div className="absolute bottom-2 right-4 w-3 h-4 bg-neutral-300 opacity-40 rounded-full transform rotate-12"></div>
            
            {/* Organic background pattern */}
            <div className="absolute inset-0 opacity-3">
              <div className="w-full h-full" style={{
                backgroundImage: `radial-gradient(ellipse at 30% 30%, #737373 1px, transparent 1px), radial-gradient(ellipse at 70% 70%, #737373 0.5px, transparent 0.5px)`,
                backgroundSize: '12px 8px'
              }}></div>
            </div>
          </>
        );
      
      case 'geometric':
        return (
          <>
            {/* Geometric angular borders */}
            <div className="absolute inset-2 border-2 border-neutral-200 opacity-50" style={{
              clipPath: 'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))'
            }}></div>
            
            {/* Geometric corner elements */}
            <div className="absolute top-1 left-1 w-6 h-6 border-2 border-neutral-300 opacity-60 transform rotate-45"></div>
            <div className="absolute top-1 right-1 w-6 h-6 border-2 border-neutral-300 opacity-60 transform rotate-45"></div>
            <div className="absolute bottom-1 left-1 w-6 h-6 border-2 border-neutral-300 opacity-60 transform rotate-45"></div>
            <div className="absolute bottom-1 right-1 w-6 h-6 border-2 border-neutral-300 opacity-60 transform rotate-45"></div>
            
            {/* Abstract geometric shapes */}
            <div className="absolute top-1/4 left-1 w-2 h-8 bg-neutral-200 opacity-30 transform rotate-12"></div>
            <div className="absolute top-1/4 right-1 w-2 h-8 bg-neutral-200 opacity-30 transform -rotate-12"></div>
            <div className="absolute bottom-1/4 left-1 w-2 h-8 bg-neutral-200 opacity-30 transform -rotate-12"></div>
            <div className="absolute bottom-1/4 right-1 w-2 h-8 bg-neutral-200 opacity-30 transform rotate-12"></div>
            
            {/* Geometric background */}
            <div className="absolute inset-0 opacity-4">
              <div className="w-full h-full" style={{
                backgroundImage: `linear-gradient(45deg, #737373 25%, transparent 25%), linear-gradient(-45deg, #737373 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #737373 75%), linear-gradient(-45deg, transparent 75%, #737373 75%)`,
                backgroundSize: '6px 6px'
              }}></div>
            </div>
          </>
        );
      
      case 'vintage':
        return (
          <>
            {/* Art deco style borders */}
            <div className="absolute inset-2 border-2 border-neutral-200 opacity-50"></div>
            <div className="absolute inset-3 border border-neutral-300 opacity-40"></div>
            
            {/* Art deco corner decorations */}
            <div className="absolute top-2 left-2 w-8 h-8 border-2 border-neutral-300 opacity-50" style={{
              clipPath: 'polygon(0 0, 100% 0, 100% 50%, 50% 100%, 0 100%)'
            }}></div>
            <div className="absolute top-2 right-2 w-8 h-8 border-2 border-neutral-300 opacity-50" style={{
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 100%, 0 50%)'
            }}></div>
            <div className="absolute bottom-2 left-2 w-8 h-8 border-2 border-neutral-300 opacity-50" style={{
              clipPath: 'polygon(0 0, 50% 0, 100% 50%, 100% 100%, 0 100%)'
            }}></div>
            <div className="absolute bottom-2 right-2 w-8 h-8 border-2 border-neutral-300 opacity-50" style={{
              clipPath: 'polygon(0 50%, 50% 0, 100% 0, 100% 100%, 0 100%)'
            }}></div>
            
            {/* Art deco sunburst pattern */}
            <div className="absolute inset-0 opacity-3">
              <div className="w-full h-full" style={{
                backgroundImage: `repeating-conic-gradient(from 0deg at 50% 50%, #737373 0deg, #737373 2deg, transparent 2deg, transparent 8deg)`,
                backgroundSize: '100% 100%'
              }}></div>
            </div>
          </>
        );
      
      case 'waves':
        return (
          <>
            {/* Flowing wave borders */}
            <div className="absolute inset-2 border-2 border-neutral-200 rounded-3xl opacity-50"></div>
            
            {/* Wave decorations */}
            <div className="absolute top-2 left-0 right-0 h-4 opacity-30" style={{
              background: `radial-gradient(ellipse at center, #737373 30%, transparent 30%)`,
              backgroundSize: '20px 8px'
            }}></div>
            <div className="absolute bottom-2 left-0 right-0 h-4 opacity-30" style={{
              background: `radial-gradient(ellipse at center, #737373 30%, transparent 30%)`,
              backgroundSize: '20px 8px'
            }}></div>
            
            {/* Side wave patterns */}
            <div className="absolute left-2 top-0 bottom-0 w-4 opacity-30" style={{
              background: `radial-gradient(ellipse at center, #737373 30%, transparent 30%)`,
              backgroundSize: '8px 20px'
            }}></div>
            <div className="absolute right-2 top-0 bottom-0 w-4 opacity-30" style={{
              background: `radial-gradient(ellipse at center, #737373 30%, transparent 30%)`,
              backgroundSize: '8px 20px'
            }}></div>
            
            {/* Wave background */}
            <div className="absolute inset-0 opacity-4">
              <div className="w-full h-full" style={{
                backgroundImage: `repeating-linear-gradient(45deg, #737373 0px, #737373 1px, transparent 1px, transparent 8px), repeating-linear-gradient(-45deg, #737373 0px, #737373 1px, transparent 1px, transparent 8px)`,
                backgroundSize: '12px 12px'
              }}></div>
            </div>
          </>
        );
      
      case 'minimal':
        return (
          <>
            {/* Minimal clean border */}
            <div className="absolute inset-6 border border-gray-300 opacity-60"></div>
            
            {/* Subtle corner accents */}
            <div className="absolute top-5 left-5 w-3 h-3 border-l border-t border-gray-400 opacity-40"></div>
            <div className="absolute top-5 right-5 w-3 h-3 border-r border-t border-gray-400 opacity-40"></div>
            <div className="absolute bottom-5 left-5 w-3 h-3 border-l border-b border-gray-400 opacity-40"></div>
            <div className="absolute bottom-5 right-5 w-3 h-3 border-r border-b border-gray-400 opacity-40"></div>
          </>
        );
      
      case 'professional':
        return (
          <>
            {/* Professional double border */}
            <div className="absolute inset-2 border-2 border-neutral-300 opacity-50"></div>
            <div className="absolute inset-3 border border-neutral-400 opacity-40"></div>
            
            {/* Professional corner brackets */}
            <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-neutral-400 opacity-60"></div>
            <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-neutral-400 opacity-60"></div>
            <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-neutral-400 opacity-60"></div>
            <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-neutral-400 opacity-60"></div>
            
            {/* Subtle professional background */}
            <div className="absolute inset-0 opacity-2">
              <div className="w-full h-full" style={{
                backgroundImage: `linear-gradient(90deg, #737373 1px, transparent 1px), linear-gradient(0deg, #737373 1px, transparent 1px)`,
                backgroundSize: '20px 20px'
              }}></div>
            </div>
          </>
        );
      
      case 'academic':
        return (
          <>
            {/* Academic traditional border */}
            <div className="absolute inset-2 border-3 border-neutral-300 opacity-50"></div>
            <div className="absolute inset-3 border border-neutral-400 opacity-40"></div>
            
            {/* Academic shield-like corners */}
            <div className="absolute top-2 left-2 w-8 h-8 border-2 border-neutral-400 opacity-50 rounded-tl-lg"></div>
            <div className="absolute top-2 right-2 w-8 h-8 border-2 border-neutral-400 opacity-50 rounded-tr-lg"></div>
            <div className="absolute bottom-2 left-2 w-8 h-8 border-2 border-neutral-400 opacity-50 rounded-bl-lg"></div>
            <div className="absolute bottom-2 right-2 w-8 h-8 border-2 border-neutral-400 opacity-50 rounded-br-lg"></div>
            
            {/* Academic laurel-like decorations */}
            <div className="absolute top-1/2 left-1 transform -translate-y-1/2">
              <div className="w-1 h-6 bg-neutral-300 opacity-40 rounded-full"></div>
            </div>
            <div className="absolute top-1/2 right-1 transform -translate-y-1/2">
              <div className="w-1 h-6 bg-neutral-300 opacity-40 rounded-full"></div>
            </div>
            
            {/* Academic background pattern */}
            <div className="absolute inset-0 opacity-3">
              <div className="w-full h-full" style={{
                backgroundImage: `radial-gradient(circle at 50% 50%, #737373 1px, transparent 1px)`,
                backgroundSize: '15px 15px'
              }}></div>
            </div>
          </>
        );
      
      case 'modern':
        return (
          <>
            {/* Modern clean asymmetric border */}
            <div className="absolute inset-2 border-2 border-gray-300 opacity-50" style={{
              clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))'
            }}></div>
            
            {/* Modern accent lines */}
            <div className="absolute top-2 left-2 w-8 h-0.5 bg-neutral-400 opacity-60"></div>
            <div className="absolute top-2 left-2 w-0.5 h-8 bg-neutral-400 opacity-60"></div>
            
            <div className="absolute bottom-2 right-2 w-8 h-0.5 bg-neutral-400 opacity-60"></div>
            <div className="absolute bottom-2 right-2 w-0.5 h-8 bg-neutral-400 opacity-60"></div>
            
            {/* Modern dot accents */}
            <div className="absolute top-4 right-4 w-2 h-2 bg-neutral-400 opacity-50 rounded-full"></div>
            <div className="absolute bottom-4 left-4 w-2 h-2 bg-neutral-400 opacity-50 rounded-full"></div>
            
            {/* Modern subtle background */}
            <div className="absolute inset-0 opacity-2">
              <div className="w-full h-full" style={{
                backgroundImage: `linear-gradient(135deg, #737373 0%, transparent 1%), linear-gradient(225deg, #737373 0%, transparent 1%)`,
                backgroundSize: '12px 12px'
              }}></div>
            </div>
          </>
        );
      
      default:
        return null;
    }
  };

  const theme = getPatternTheme(certificatePattern);

  // dir="ltr" deliberately, and this file keeps its physical utilities.
  //
  // The certificate is rasterised by html2canvas for PDF export, and CSS
  // logical properties are the family html2canvas reproduces worst — it
  // reimplements layout rather than reading the browser's, and it clones into
  // an offscreen iframe where dir inheritance is unreliable. Converting this
  // file would risk silently breaking every downloaded certificate, and PDFs
  // are not something anyone checks during review.
  //
  // Most of the physical classes here are symmetric corner ornaments anyway,
  // which carry no directional meaning. Arabic is handled where it matters:
  // the text nodes below use dir="auto". A properly RTL certificate belongs in
  // a separate template variant, not a flip of this one.
  return (
    <div dir="ltr" className="bg-gradient-to-br from-neutral-50 to-neutral-50 border border-neutral-200 rounded-xl p-4 w-full h-full">
      <div className="bg-white rounded-lg shadow-sm p-6 relative overflow-hidden w-full h-full flex flex-col">
        {/* Dynamic Certificate Pattern */}
        {renderCertificatePattern(certificatePattern)}

        {/* Certificate ID - Top Left */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
          <div className="flex items-center space-x-1">
            <Hash className={`w-3 h-3 sm:w-4 sm:h-4 ${theme.icon}`} />
            <span className={`text-xs sm:text-sm ${theme.secondary} font-medium`}>ID: {certificateId || 'LH-2024-001'}</span>
          </div>
        </div>

        {/* QR Code Box - Top Right */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
          <div className={`w-16 h-16 sm:w-24 sm:h-24 border-2 ${theme.secondary.replace('text-', 'border-')} rounded-md bg-white/90 backdrop-blur-sm p-1`}>
            {qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt={t('certificate.arte.qr_alt')}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <QrCode className={`w-8 h-8 sm:w-12 sm:h-12 ${theme.icon}`} />
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center space-y-3 px-6 py-6">
          {/* Header with decorative line */}
          <div className="flex items-center justify-center space-x-2 mb-2">
            <div className={`w-6 sm:w-8 h-px bg-gradient-to-r from-transparent ${theme.secondary.replace('text-', 'to-')}`}></div>
            <div className={`text-xs sm:text-sm ${theme.secondary} font-medium uppercase tracking-wider`}>{t('certificate.arte.certificado')}</div>
            <div className={`w-6 sm:w-8 h-px bg-gradient-to-l from-transparent ${theme.secondary.replace('text-', 'to-')}`}></div>
          </div>

          {/* Award Icon with decorative elements */}
          <div className="flex justify-center relative">
            <div className={`w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br ${theme.icon.replace('text-', 'from-')}-100 ${theme.icon.replace('text-', 'to-')}-200 rounded-full flex items-center justify-center relative`}>
              <Award className={`w-6 h-6 sm:w-8 sm:h-8 ${theme.icon}`} />
              {/* Decorative rays */}
              <div className="absolute inset-0 rounded-full">
                <div className={`absolute top-0 left-1/2 w-px h-2 sm:h-3 ${theme.secondary.replace('text-', 'bg-')} transform -translate-x-1/2 -translate-y-1 opacity-60`}></div>
                <div className={`absolute bottom-0 left-1/2 w-px h-2 sm:h-3 ${theme.secondary.replace('text-', 'bg-')} transform -translate-x-1/2 translate-y-1 opacity-60`}></div>
                <div className={`absolute left-0 top-1/2 w-2 sm:w-3 h-px ${theme.secondary.replace('text-', 'bg-')} transform -translate-y-1/2 -translate-x-1 opacity-60`}></div>
                <div className={`absolute right-0 top-1/2 w-2 sm:w-3 h-px ${theme.secondary.replace('text-', 'bg-')} transform -translate-y-1/2 translate-x-1 opacity-60`}></div>
              </div>
            </div>
          </div>

          {/* Certificate Content */}
          <div className="flex flex-col justify-center items-center flex-1 max-w-full">
            <h4 dir="auto" className={`font-bold text-sm sm:text-base ${theme.primary} mb-2 text-center`}>
              {certificationName || t('certificate.arte.nome_exemplo')}
            </h4>
            {learnerName && (
              <div className="flex flex-col items-center mb-2">
                <span className={`text-[10px] sm:text-xs ${theme.secondary} uppercase tracking-wider`}>{t('certificate.arte.concedido_a')}</span>
                <span dir="auto" className={`font-semibold text-sm sm:text-base ${theme.primary} text-center`}>
                  {learnerName}
                </span>
              </div>
            )}
            <p dir="auto" className={`text-xs sm:text-sm ${theme.secondary} text-center leading-relaxed max-w-xs sm:max-w-sm`}>
              {certificationDescription || t('certificate.arte.descricao_exemplo')}
            </p>
          </div>

          {/* Decorative divider */}
          <div className="flex items-center justify-center space-x-1 py-1">
            <div className={`w-2 h-px ${theme.secondary.replace('text-', 'bg-')} opacity-50`}></div>
            <div className={`w-1 h-1 ${theme.primary.replace('text-', 'bg-')} rounded-full opacity-60`}></div>
            <div className={`w-2 h-px ${theme.secondary.replace('text-', 'bg-')} opacity-50`}></div>
          </div>
          
          {/* Certification Type Badge */}
          <div className={`inline-flex items-center space-x-1 text-xs sm:text-sm ${theme.badge} px-3 py-1 rounded-full border`}>
            <CheckCircle size={12} />
            <span className="font-medium">
              {t(`certificate.arte.tipo_${certificationType || 'completion'}`, { defaultValue: t('certificate.arte.tipo_completion') })}
            </span>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="relative z-10 mt-auto p-6 pt-8">
          <div className="flex items-end justify-between w-full">
            {/* Left: Teacher/Organization Signature */}
            <div className="flex flex-col items-start space-y-1 flex-1">
              <div className="flex items-center space-x-1">
                <User className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${theme.icon}`} />
                <span className={`text-xs ${theme.secondary} font-medium`}>{t('certificate.arte.instrutor')}</span>
              </div>
              <div className={`text-xs ${theme.primary} font-semibold`} dir="auto">
                {certificateInstructor || t('certificate.arte.instrutor_exemplo')}
              </div>
              <div className={`h-px w-10 sm:w-12 ${theme.secondary.replace('text-', 'bg-')} opacity-50`}></div>
            </div>

            {/* Center: Logo */}
            <div className="flex flex-col items-center space-y-1 flex-1">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center`}>
                {org?.logo_image ? (
                  <img
                    src={`${getOrgLogoMediaDirectory(org.org_uuid, org?.logo_image)}`}
                    alt={t('certificate.arte.logo_alt')}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className={`w-full h-full ${theme.icon.replace('text-', 'bg-')}-100 rounded-full flex items-center justify-center`}>
                    <Building className={`w-4 h-4 sm:w-5 sm:h-5 ${theme.icon}`} />
                  </div>
                )}
              </div>
              <div className={`text-xs ${theme.secondary} font-medium`} dir="auto">
                {org?.name || 'Discipulei'}
              </div>
            </div>

            {/* Right: Award Date */}
            <div className="flex flex-col items-end space-y-1 flex-1">
              <div className="flex items-center space-x-1">
                <Calendar className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${theme.icon}`} />
                <span className={`text-xs ${theme.secondary} font-medium`}>{t('certificate.arte.concedido_em')}</span>
              </div>
              <div className={`text-xs ${theme.primary} font-semibold`}>
                {awardedDate || t('certificate.arte.data_exemplo')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificatePreview; 