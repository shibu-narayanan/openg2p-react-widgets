/**
 * Standalone app to run SectionBuilder example
 * Run with: npx vite (after setting up vite.config.ts)
 * 
 * This example shows how to integrate SectionBuilder in a host application.
 * For height adaptation, ensure the container has a defined height.
 * 
 * Host Application Pattern:
 * <div className="p-8">
 *   <div className="bg-white rounded-[30px] p-8 h-full w-full">
 *     <SectionBuilder ... />
 *   </div>
 * </div>
 * 
 * Note: Use h-full (height: 100%) instead of min-h-[600px] to fill available space.
 * The parent container should have flex-1 or a defined height.
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { SectionBuilder } from '../src/components/SectionBuilder';
import { IntakeFormExample } from './intake-form-example';
import { HeaderSectionExample } from './header-section-example';
import { SectionRendererExample } from './section-renderer-example';
import { ThemeExample } from './theme-example';
import { DialogTableExample } from './dialog-table-example';
import { SectionConfig } from '../src/types';
import { createWidgetStore } from '../src/store';
import { WidgetProvider } from '../src/components/WidgetProvider';

// Create Redux store
const store = createWidgetStore();

// Example section data
const initialSection: SectionConfig = {
  'section-id': 'example-section',
  'section-title': 'Example Section',
  'section-editable': true,
  panels: [
    {
      'panel-id': 'personal-details',
      'panel-orientation': 'horizontal',
      panels: [
        {
          'panel-id': 'left-column',
          'panel-orientation': 'vertical',
          widgets: [
            {
              widget: 'text',
              'widget-type': 'input',
              'widget-id': 'name',
              'widget-label': 'Full Name',
              'widget-data-path': 'person.name',
              'widget-required': true,
              'widget-readonly': false,
            },
            {
              widget: 'text',
              'widget-type': 'input',
              'widget-id': 'email',
              'widget-label': 'Email Address',
              'widget-data-path': 'person.email',
              'widget-data-validation': {
                validationType: 'email',
                required: true,
              },
            },
          ],
        },
        {
          'panel-id': 'right-column',
          'panel-orientation': 'vertical',
          widgets: [
            {
              widget: 'number',
              'widget-type': 'input',
              'widget-id': 'age',
              'widget-label': 'Age',
              'widget-data-path': 'person.age',
              'widget-data-validation': {
                min: 0,
                max: 120,
              },
            },
            {
              widget: 'date',
              'widget-type': 'input',
              'widget-id': 'dob',
              'widget-label': 'Date of Birth',
              'widget-data-path': 'person.dob',
            },
          ],
        },
      ],
    },
  ],
};

type TabId =
  | 'section-builder'
  | 'intake-form'
  | 'header-section'
  | 'section-renderer'
  | 'dialog-table'
  | 'theme';

function App() {
  const [section, setSection] = useState<SectionConfig>(initialSection);
  const [activeTab, setActiveTab] = useState<TabId>('section-builder');
  const tabStyle = (id: TabId): React.CSSProperties => {
    const isActive = activeTab === id;
    return {
      padding: '8px 16px',
      fontWeight: isActive ? 600 : 400,
      background: isActive ? 'var(--owt-color-bg-alt, #F6F6F6)' : 'transparent',
      border: `1px solid ${isActive ? 'var(--owt-color-border, #C4C4C4)' : 'transparent'}`,
      borderRadius: 'var(--owt-btn-border-radius, 6px)',
      cursor: 'pointer',
      color: 'var(--owt-color-text, #011627)',
      fontFamily: 'Roboto, sans-serif',
    };
  };

  const handleSectionChange = (updatedSection: SectionConfig) => {
    setSection(updatedSection);
    console.log('Section updated:', updatedSection);
  };

  const handleSave = (savedSection: SectionConfig) => {
    console.log('Section saved:', savedSection);
    alert('Section saved! Check console for JSON output.');
  };

  return (
    <Provider store={store}>
      <WidgetProvider store={store}>
        <div style={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--owt-color-bg-alt, #F6F6F6)',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 20px',
            background: 'var(--owt-color-bg, #FFFFFF)',
            borderBottom: '1px solid var(--owt-color-border-light, #E4E4E4)',
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('section-builder')}
              style={tabStyle('section-builder')}
            >
              Section Builder
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('intake-form')}
              style={tabStyle('intake-form')}
            >
              Intake Form
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('header-section')}
              style={tabStyle('header-section')}
            >
              Header Section
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('section-renderer')}
              style={tabStyle('section-renderer')}
            >
              Section Renderer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dialog-table')}
              style={tabStyle('dialog-table')}
            >
              Dialog Table
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('theme')}
              style={tabStyle('theme')}
            >
              Theme
            </button>
          </div>
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
          }}>
            {activeTab === 'section-builder' && (
              <div style={{
                width: '100%',
                maxWidth: '1400px',
                margin: '0 auto',
                flex: '1 1 0',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
              }}>
                <SectionBuilder
                  initialSection={section}
                  onChange={handleSectionChange}
                  onSave={handleSave}
                />
              </div>
            )}
            {activeTab === 'intake-form' && <IntakeFormExample />}
            {activeTab === 'header-section' && <HeaderSectionExample />}
            {activeTab === 'section-renderer' && <SectionRendererExample />}
            {activeTab === 'dialog-table' && <DialogTableExample />}
            {activeTab === 'theme' && <ThemeExample />}
          </div>
        </div>
      </WidgetProvider>
    </Provider>
  );
}

// Render the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
