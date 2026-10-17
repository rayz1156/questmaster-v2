// =====================================================================
//  StafKita Akademi — Konfigurasi penjenamaan berpusat
//  Sumber tunggal untuk nama produk, tagline, warna dan kenalan.
//  Import: import { BRANDING } from '@/lib/branding.config';
// =====================================================================

export const BRANDING = {
  product: {
    name: 'StafKita Akademi',
    fullName: 'StafKita Akademi',
    shortName: 'StafKita Akademi',
    legacy: 'Kuizen LMS',
    tagline: 'Pembelajaran Korporat untuk Hasil yang Terukur',
    taglineBM: 'Pembelajaran Korporat untuk Hasil yang Terukur',
    description:
      'Platform pembelajaran korporat StafKita Akademi untuk latihan pekerja, pematuhan dan pembangunan tenaga kerja.',
    productType: 'Enterprise LMS',
    keywords: [
      'enterprise LMS',
      'corporate training Malaysia',
      'HRDCorp training platform',
      'compliance training',
      'L&D platform',
      'workforce learning',
      'StafKita Akademi',
    ],
  },

  endorser: {
    name: 'Veltrix',
    fullName: 'Veltrix Technology Center',
    legalEntity: 'Veltrix Technology Centre Sdn Bhd',
    tagline: 'by Veltrix',
    longTagline: 'A Veltrix Technology Center Product',
    website: 'https://www.veltrix.technology',
    parent: 'An UPSI Spin-Off Initiative',
    accreditations: ['HRDCorp Claimable', 'MBOT Recognised', 'MQA Aligned'],
  },

  logo: {
    product: '/assets/kuizen-academy-logo.svg',
    productMark: '/assets/kuizen-academy-mark.svg',
    productWhite: '/assets/kuizen-academy-logo-white.svg',
    endorser: '/assets/veltrix-logo.svg',
    lockup: '/assets/kuizen-academy-by-veltrix.svg',
    lockupHorizontal: '/assets/kuizen-academy-by-veltrix-h.svg',
    favicon: '/favicon.ico',
    appleTouchIcon: '/apple-touch-icon.png',
    ogImage: '/og-image-kuizen-academy.png',
  },

  colors: {
    // Warna utama StafKita Akademi
    primary: '#6576ff',
    primaryDeep: '#5664d9',
    primaryLight: '#ebeeff',
    primaryGlow: 'rgba(101, 118, 255, 0.25)',
    primaryGradient: '#6576ff',

    // Asas gelap StafKita (bar sisi)
    navyDeepest: '#101924',
    navyDeep: '#1c2b46',
    navyMid: '#203247',

    // Kuning status StafKita
    gold: '#f4bd0e',
    goldBright: '#f4bd0e',
    goldSoft: 'rgba(244, 189, 14, 0.15)',
    goldBorder: 'rgba(244, 189, 14, 0.35)',
    goldGradient: '#f4bd0e',

    // Neutral kelabu StafKita
    textPrimary: '#FFFFFF',
    textBody: '#6e82a5',
    textMuted: '#8094ae',
    silver: '#c7cfdc',
    silverDim: '#8094ae',
    borderLine: 'rgba(32, 50, 71, 0.12)',

    // Berfungsi (warna status StafKita)
    success: '#1ee0ac',
    warning: '#f4bd0e',
    error: '#e85347',
    info: '#09c2de',
  },

  fonts: {
    heading: "'Nunito', sans-serif",
    body: "'Roboto', sans-serif",
    mono: "'JetBrains Mono', monospace",
  },

  contact: {
    supportEmail: 'support@stafkita.com',
    salesEmail: 'support@stafkita.com',
    adminEmail: 'support@stafkita.com',
    veltricsEmail: 'hello@veltrix.technology',
  },

  legal: {
    copyright: `\u00A9 ${new Date().getFullYear()} StafKita Akademi.`,
    companyRegistration: 'Veltrix Technology Centre Sdn Bhd',
    spinOffNote: 'An UPSI Spin-Off Initiative',
  },

  positioning: {
    audienceTypes: [
      'HR & L&D Departments',
      'Corporate Training Teams',
      'Compliance Officers',
      'Educational Institutions',
      'Government Agencies & GLCs',
    ],
    useCases: [
      'Employee Onboarding',
      'Compliance Training',
      'Skills Development',
      'Leadership Development',
      'Product Training',
      'Sales Enablement',
      'Continuous Learning Programs',
    ],
    differentiators: [
      'HRDCorp Claimable Programs',
      'MBOT Recognised Content',
      'Bahasa Melayu Native',
      'PDPA Compliant',
      'Sovereign Malaysian Infrastructure',
    ],
  },

  features: {
    learning: [
      'Video Lessons (Adilo-powered)',
      'Interactive Assessments',
      'Resource Library',
      'Cohort-based Learning',
      'Self-paced Modules',
      'Microlearning Support',
    ],
    enterprise: [
      'Organization Management',
      'Department/Team Structure',
      'Role-based Access Control',
      'Bulk User Provisioning',
      'SSO Integration',
      'Custom Branding (White-label)',
    ],
    analytics: [
      'Learner Progress Tracking',
      'Completion Reports',
      'Engagement Analytics',
      'ROI Measurement',
      'Compliance Dashboards',
      'Custom Reports & Exports',
    ],
    integration: [
      'HRIS Integration',
      'Single Sign-On (SSO)',
      'API Access',
      'Webhook Support',
      'CSV Bulk Operations',
    ],
  },

  migration: {
    legacyDomain: 'lms.kuizen.fun',
    newDomain: 'academy.stafkita.com',
    legacyName: 'Kuizen LMS',
    newName: 'StafKita Akademi',
    migrationDate: 'TBD',
    creatorMigrationPath:
      'Existing creators can continue or migrate to enterprise tier.',
  },

  social: {
    linkedin: 'https://linkedin.com/company/veltrix-technology',
    twitter: '@veltrixtech',
  },
} as const;

export type BrandingConfig = typeof BRANDING;
export default BRANDING;
