export type CertificateVariant = 'completion' | 'achievement' | 'compliance' | 'hrdcorp' | 'mbot' | 'microcredential';

export interface CertificateConfig {
  variant: CertificateVariant;
  learner: {
    name: string;
    employeeId?: string;
    department?: string;
    organization: string;
  };
  program: {
    name: string;
    duration: number; // hours
    completionDate: string | Date;
    accreditations: string[]; // ['HRDCorp Claimable','MBOT Recognised']
  };
  signatures?: Array<{ name: string; title: string; signatureImage?: string }>;
  branding?: {
    organizationLogo?: string;
    useKuizenAcademyBranding?: boolean;
    useVeltrixEndorsement?: boolean;
  };
  verification: {
    id: string;
    verifyUrl: string;
    qrCodeData?: string;
  };
}
