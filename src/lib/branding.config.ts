// =====================================================================
//  Kuizen Academy by Veltrix — Centralized Branding Configuration
//  Single source of truth for product name, tagline, colors, contacts.
//  Import: import { BRANDING } from '@/lib/branding.config';
// =====================================================================

export const BRANDING = {
  product: {
    name: 'Kuizen Academy',
    fullName: 'Kuizen Academy by Veltrix',
    shortName: 'Kuizen Academy',
    legacy: 'Kuizen LMS',
    tagline: 'Enterprise Learning, Engineered for Outcomes',
    taglineBM: 'Pembelajaran Korporat untuk Hasil yang Terukur',
    description:
      'Enterprise Learning Management Platform for corporate training, compliance, and workforce development.',
    productType: 'Enterprise LMS',
    keywords: [
      'enterprise LMS',
      'corporate training Malaysia',
      'HRDCorp training platform',
      'compliance training',
      'L&D platform',
      'workforce learning',
      'Kuizen Academy',
      'Veltrix learning',
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
    // Kuizen Academy Primary
    primary: '#047857',
    primaryDeep: '#064E3B',
    primaryLight: '#10B981',
    primaryGlow: 'rgba(4, 120, 87, 0.25)',
    primaryGradient: 'linear-gradient(135deg, #047857 0%, #065F46 100%)',

    // Veltrix Foundation
    navyDeepest: '#060F1F',
    navyDeep: '#0A1628',
    navyMid: '#102849',

    // Veltrix Gold
    gold: '#D4AF37',
    goldBright: '#F5C842',
    goldSoft: 'rgba(212, 175, 55, 0.15)',
    goldBorder: 'rgba(212, 175, 55, 0.35)',
    goldGradient: 'linear-gradient(135deg, #D4AF37 0%, #F5C842 100%)',

    // Shared neutrals
    textPrimary: '#FFFFFF',
    textBody: '#B8C5D6',
    textMuted: '#6B7894',
    silver: '#C0C8D4',
    silverDim: '#8995A8',
    borderLine: 'rgba(192, 200, 212, 0.12)',

    // Functional
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },

  fonts: {
    heading: "'Cormorant Garamond', serif",
    body: "'Manrope', sans-serif",
    mono: "'JetBrains Mono', monospace",
  },

  contact: {
    supportEmail: 'support@kuizen-academy.com',
    salesEmail: 'sales@kuizen-academy.com',
    adminEmail: 'admin@kuizen-academy.com',
    veltricsEmail: 'hello@veltrix.technology',
  },

  legal: {
    copyright: `\u00A9 ${new Date().getFullYear()} Kuizen Academy. A Veltrix Technology Center product.`,
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
    newDomain: 'academy.kuizen.fun',
    legacyName: 'Kuizen LMS',
    newName: 'Kuizen Academy',
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
