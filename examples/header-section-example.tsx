/**
 * Header Section Widget Example
 *
 * Demonstrates the HeaderSectionWidget in a RegistryView with:
 * - Full-width section spanning all 3 columns
 * - View mode: profile image, name, functional ID, status badge, metadata
 * - Edit mode: status dropdown + status reason text input become editable
 * - widget-field-config for explicit per-field data source mapping
 * - Language switcher to test host-driven i18n
 *
 * Translation keys: The host locale JSON files should use the English label
 * text as keys. See the `translations` object below for the full list.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { createWidgetStore } from '../src/store';
import { WidgetProvider, SectionsContainer } from '../src';
import type { SectionConfig } from '../src/types';
import type { SectionChanges } from '../src/components/SectionRenderer';
import type { DataSourceRequestHandler } from '../src/types';

// ── Simulates the host app's locale JSON files ──────────────────
// In a real app these come from /locales/en.json, /locales/fr.json, etc.
// Keys are the English label text — same keys the widget passes to translate().
const translations: Record<string, Record<string, string>> = {
  en: {
    // Header section labels
    'Functional Record ID': 'Functional Record ID',
    'Record Status': 'Record Status',
    'Status Reason': 'Status Reason',
    'Select': 'Select',
    'Enter Reason': 'Enter Reason',
    'Created by': 'Created by',
    'Created at': 'Created at',
    'Last Approved by': 'Last Approved by',
    'Last Approved at': 'Last Approved at',
    // Other widget labels
    'Registrant Details': 'Registrant Details',
    'First Name': 'First Name',
    'Last Name': 'Last Name',
    'Date of Birth': 'Date of Birth',
    'Gender': 'Gender',
    'Email': 'Email',
    'Phone Number': 'Phone Number',
    'Nationality': 'Nationality',
    'Language': 'Language',
    'Street': 'Street',
    'City': 'City',
    'State': 'State',
    'Postal Code': 'Postal Code',
  },
  fr: {
    // Header section labels
    'Functional Record ID': 'ID fonctionnel',
    'Record Status': 'Statut du registre',
    'Status Reason': 'Raison du statut',
    'Select': 'Sélectionner',
    'Enter Reason': 'Entrer la raison',
    'Created by': 'Créé par',
    'Created at': 'Créé le',
    'Last Approved by': 'Dernier approbateur',
    'Last Approved at': 'Dernière approbation le',
    // Other widget labels
    'Registrant Details': 'Détails du déclarant',
    'First Name': 'Prénom',
    'Last Name': 'Nom de famille',
    'Date of Birth': 'Date de naissance',
    'Gender': 'Genre',
    'Email': 'E-mail',
    'Phone Number': 'Numéro de téléphone',
    'Nationality': 'Nationalité',
    'Language': 'Langue',
    'Street': 'Rue',
    'City': 'Ville',
    'State': 'État',
    'Postal Code': 'Code postal',
  },
  ar: {
    // Header section labels
    'Functional Record ID': 'المعرف الوظيفي',
    'Record Status': 'حالة السجل',
    'Status Reason': 'سبب الحالة',
    'Select': 'اختر',
    'Enter Reason': 'أدخل السبب',
    'Created by': 'أنشأه',
    'Created at': 'تاريخ الإنشاء',
    'Last Approved by': 'آخر موافقة بواسطة',
    'Last Approved at': 'تاريخ آخر موافقة',
    // Other widget labels
    'Registrant Details': 'تفاصيل المسجل',
    'First Name': 'الاسم الأول',
    'Last Name': 'اسم العائلة',
    'Date of Birth': 'تاريخ الميلاد',
    'Gender': 'الجنس',
    'Email': 'البريد الإلكتروني',
    'Phone Number': 'رقم الهاتف',
    'Nationality': 'الجنسية',
    'Language': 'اللغة',
    'Street': 'الشارع',
    'City': 'المدينة',
    'State': 'الولاية',
    'Postal Code': 'الرمز البريدي',
  },
};

// ── Schema data (simulates API response) ────────────────────────
const schemaData = {
  registrant: {
    register_id: 'a1a4d25a-1cd4-4356-abac-985a0b3c6bcd',
    internal_record_id: '99c9a49b-404c-4fda-b893-92c655831208',
    initiated_by_staff_id: 'WANGO',
    record_name: 'Sarah Elizabeth',
    functional_record_id: '1234567890',
    foundational_id: '1234-5678-9012-3456',
    record_image_storage_id: '',
    record_image_url: '',
    record_status: 'active',
    record_status_reason: 'Reason text here',
    created_by: 'Robert David',
    created_at: '14 Jan 2025',
    last_approved_by: 'Linda Susan',
    last_approved_at: '20 Mar 2026',
    last_authenticated_on: '2026-04-18T11:05:00Z',
    last_authentication_status: 'success',
    authentication_expiry_date: '2026-05-18T00:00:00Z',
    completion_score: 94.3456723424,
    ideal_score: 100,
    psut: 'PSUT-EXAMPLE-TOKEN-1234567890',
    first_name: 'Sarah',
    last_name: 'Elizabeth',
    date_of_birth: '1990-05-15',
    gender: 'Female',
    email: 'sarah.elizabeth@example.com',
    phone: '+1 (555) 012-3456',
    nationality: 'American',
    language: 'English',
    address: {
      street: '123 Main Street',
      city: 'Springfield',
      state: 'Illinois',
      postal_code: '62704',
    },
  },
};

// ── Header section config ───────────────────────────────────────
// NOTE: No "widget-labels" needed — the widget uses the English text
// as translation keys by default. The host just needs those keys in
// its locale JSON files.
const headerSection: SectionConfig = {
  'section-id': 'header-section',
  'section-title': '',
  'section-editable': true,
  'section-data-root': 'registrant',
  'section-column-span': 3,
  panels: [
    {
      'panel-id': 'header-panel',
      'panel-orientation': 'vertical',
      'panel-column-span': 3,
      widgets: [
        {
          widget: 'header-section',
          'widget-type': 'group',
          'widget-id': 'registry-header',
          'widget-data-path': {
            image: 'record_image_storage_id',
            imageUrl: 'record_image_url',
            name: 'record_name',
            functionalId: 'functional_record_id',
            status: 'record_status',
            statusReason: 'record_status_reason',
            completionScore: 'completion_score',
            idealScore: 'ideal_score',
            createdBy: 'created_by',
            createdAt: 'created_at',
            lastApprovedBy: 'last_approved_by',
            lastApprovedAt: 'last_approved_at',
          },
          'widget-field-config': {
            status: {
              'data-source': {
                type: 'static',
                options: [
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'archived', label: 'Archived' },
                ],
              },
            },
          },
          // HeaderSectionWidget uses extra formatting keys beyond WidgetFormat.
          'widget-data-format': {
            imageSize: 120,
            nameColor: '#ED7C22',
            statusColors: {
              active: '#16A34A',
              inactive: '#D97706',
              archived: '#6B7280',
            },
          } as any,
        },
      ],
    },
  ],
};

const idAuthenticationSection: SectionConfig = {
  'section-id': 'id-authentication',
  'section-title': 'ID Authentication',
  'section-editable': false,
  'section-hide-edit-button': true,
  'section-data-root': 'registrant',
  'section-column-span': 3,
  panels: [
    {
      'panel-id': 'id-authentication-panel',
      'panel-orientation': 'vertical',
      'panel-column-span': 3,
      widgets: [
        {
          widget: 'id-authentication',
          'widget-type': 'group',
          'widget-id': 'id-auth',
          'widget-readonly': true,
          'widget-data-path': {
            internalRecordId: 'internal_record_id',
            initiatedByStaffId: 'initiated_by_staff_id',
            foundationalId: 'foundational_id',
            lastAuthenticatedOn: 'last_authenticated_on',
            lastAuthenticationStatus: 'last_authentication_status',
            expiryDate: 'authentication_expiry_date',
            authenticationToken: 'psut',
          },
          'widget-auth-config': {
            service: 'registry',
            providerId: 'esignet',
            providerName: 'eSignet',
            registerId: 'a1a4d25a-1cd4-4356-abac-985a0b3c6bcd',
            authenticateEndpoint: 'authenticate_registrant',
            authenticateMethod: 'POST',
            // authorizationUrlKey: 'authorization_url', // default includes this
            useIframeOverlay: false,
            // Popup size for eSignet login (clamped to the viewport)
            // popupWidth: 1024,
            // popupHeight: 800,
          },
        },
      ],
    },
  ],
};

// ── Registrant details section with 3 vertical panels ───────────
const registrantDetailsSection: SectionConfig = {
  'section-id': 'registrant-details',
  'section-title': 'Registrant Details',
  'section-editable': true,
  'section-data-root': 'registrant',
  'section-column-span': 3,
  panels: [
    {
      'panel-id': 'personal-info',
      'panel-orientation': 'vertical',
      widgets: [
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'first-name',
          'widget-label': 'First Name',
          'widget-data-path': 'first_name',
        },
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'last-name',
          'widget-label': 'Last Name',
          'widget-data-path': 'last_name',
        },
        {
          widget: 'date',
          'widget-type': 'input',
          'widget-id': 'dob',
          'widget-label': 'Date of Birth',
          'widget-data-path': 'date_of_birth',
        },
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'gender',
          'widget-label': 'Gender',
          'widget-data-path': 'gender',
        },
      ],
    },
    {
      'panel-id': 'contact-info',
      'panel-orientation': 'vertical',
      widgets: [
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'email',
          'widget-label': 'Email',
          'widget-data-path': 'email',
          'widget-data-validation': { validationType: 'email' },
        },
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'phone',
          'widget-label': 'Phone Number',
          'widget-data-path': 'phone',
        },
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'nationality',
          'widget-label': 'Nationality',
          'widget-data-path': 'nationality',
        },
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'language',
          'widget-label': 'Language',
          'widget-data-path': 'language',
        },
      ],
    },
    {
      'panel-id': 'address-info',
      'panel-orientation': 'vertical',
      widgets: [
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'street',
          'widget-label': 'Street',
          'widget-data-path': 'address.street',
        },
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'city',
          'widget-label': 'City',
          'widget-data-path': 'address.city',
        },
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'state',
          'widget-label': 'State',
          'widget-data-path': 'address.state',
        },
        {
          widget: 'text',
          'widget-type': 'input',
          'widget-id': 'postal-code',
          'widget-label': 'Postal Code',
          'widget-data-path': 'address.postal_code',
        },
      ],
    },
  ],
};

const allSections: SectionConfig[] = [
  headerSection,
  idAuthenticationSection,
  registrantDetailsSection,
];

// ── Example component ───────────────────────────────────────────
export const HeaderSectionExample = () => {
  const store = useMemo(() => createWidgetStore(), []);
  const [language, setLanguage] = useState('en');

  // Simulates the host app's t() function backed by locale JSON files.
  // A new function reference is created on language change so the
  // WidgetProvider context updates and all widgets re-render.
  const translateFn = useCallback(
    (key: string, options?: any): string => {
      const dict = translations[language] || translations.en;
      return dict[key] || options?.defaultValue || key;
    },
    [language],
  );

  const handleSectionSave = async (changes: SectionChanges) => {
    console.log('Section saved:', changes);
    alert(`Section "${changes.section_id}" saved!\nRecords: ${JSON.stringify(changes.records, null, 2)}\nCheck console for details.`);
  };

  // Mock host API handler so the authentication widget works in examples without a backend.
  const dataSourceRequestHandler = useMemo<DataSourceRequestHandler>(() => {
    return async (service, endpoint, method, params) => {
      // eslint-disable-next-line no-console
      console.log('[examples] dataSourceRequestHandler', { service, endpoint, method, params });
      if (service !== 'registry') {
        throw new Error(`Unknown service: ${service}`);
      }
      if (endpoint === 'authenticate_registrant') {
        // eslint-disable-next-line no-console
        console.log(
          '[examples] authenticate_registrant payload',
          (params as any)?.request_payload ?? params,
        );
        // Simulate initiate authentication response with auth URL
        const rid =
          (params as any)?.request_payload?.register_id ||
          (params as any)?.register_id ||
          'demo-register';
        return {
          response_body: {
            response_payload: {
              authorization_session_id: 'auth-session-demo-001',
              provider_name:
                (params as any)?.request_payload?.provider_id ||
                (params as any)?.provider_id ||
                'eSignet',
              authorization_url: `https://example.com/?register_id=${encodeURIComponent(String(rid))}`,
            },
          },
        };
      }
      throw new Error(`Unknown endpoint: ${endpoint} (${method})`);
    };
  }, []);

  return (
    <WidgetProvider
      store={store}
      schemaData={schemaData}
      translate={translateFn}
      dataSourceRequestHandler={dataSourceRequestHandler}
    >
      <div style={{ padding: '24px', maxWidth: '1241px', margin: '0 auto' }}>
        {/* ── Language selector bar ─── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <h1 style={{ fontSize: '24px', fontFamily: 'Roboto, sans-serif', margin: 0 }}>
            Registry View — Header Section Widget
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: '#6B7280', fontFamily: 'Roboto, sans-serif' }}>
              Language:
            </span>
            {(['en', 'fr', 'ar'] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setLanguage(lng)}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: language === lng ? 700 : 400,
                  background: language === lng ? '#ED7C22' : '#fff',
                  color: language === lng ? '#fff' : '#374151',
                  border: '1px solid ' + (language === lng ? '#ED7C22' : '#D1D5DB'),
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontFamily: 'Roboto, sans-serif',
                  transition: 'all 0.15s',
                }}
              >
                {{ en: 'English', fr: 'Français', ar: 'العربية' }[lng]}
              </button>
            ))}
          </div>
        </div>

        <SectionsContainer
          sections={allSections}
          schemaData={schemaData}
          mode="RegistryView"
          onSectionSave={handleSectionSave}
        />
      </div>
    </WidgetProvider>
  );
};

export default HeaderSectionExample;
