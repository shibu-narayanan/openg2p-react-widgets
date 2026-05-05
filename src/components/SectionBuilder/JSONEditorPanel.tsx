import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Provider } from 'react-redux';
import { SectionConfig } from '../../types';
import { SectionRenderer } from '../SectionRenderer';
import { WidgetProvider, useWidgetContext } from '../WidgetProvider';
import { createWidgetStore } from '../../store';
import { resetIcon } from '../../assets';
import { WIDGET_TYPES } from './schemas';
import { validateSection } from './validate/validateSection';

interface JSONEditorPanelProps {
  section: SectionConfig;
  onChange: (section: SectionConfig) => void;
  onReset?: () => void; // Optional reset handler from parent
  mode?: 'raw';
  rawDraft?: string;
  onRawDraftChange?: (next: string) => void;
  onRawValidationChange?: (next: { isValid: boolean; errors: string[] }) => void;
}

/**
 * JSON Editor Panel - Left side of Section Builder
 */
export const JSONEditorPanel: React.FC<JSONEditorPanelProps> = ({
  section,
  onChange,
  onReset,
  mode = 'raw',
  rawDraft,
  onRawDraftChange,
  onRawValidationChange,
}) => {
  const [jsonData, setJsonData] = useState<SectionConfig>(section);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [rawJsonText, setRawJsonText] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [canApply, setCanApply] = useState<boolean>(true);

  // Store the original section when component mounts or section prop changes
  const originalSectionRef = useRef<SectionConfig>(section);

  // Get WidgetProvider context for preview modal (optional - may not be available)
  let widgetContext;
  try {
    widgetContext = useWidgetContext();
  } catch {
    widgetContext = {
      dataSourceRequestHandler: undefined,
      schemaData: undefined,
      translate: undefined,
    };
  }

  // Create a store for the preview modal if we're not in a Provider
  // This ensures SectionRenderer has access to Redux
  const previewStore = useMemo(() => createWidgetStore(), []);

  // Track if this is the initial mount
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Only update original section on initial mount (when page loads)
    // This ensures reset works until save is clicked
    // Don't update original when user makes edits (those come through onChange)
    if (isInitialMount.current) {
      originalSectionRef.current = JSON.parse(JSON.stringify(section)); // Deep copy
      isInitialMount.current = false;
    }
    // Always sync the display with the section prop (for external updates like reset from parent)
    setJsonData(section);
    const nextText = rawDraft ?? JSON.stringify(section, null, 2);
    setRawJsonText(nextText);
    onRawDraftChange?.(nextText);
    setValidationErrors([]);
    setCanApply(true);
    onRawValidationChange?.({ isValid: true, errors: [] });
  }, [section, rawDraft, onRawDraftChange, onRawValidationChange]);

  // Reset to original section
  const handleReset = useCallback(() => {
    // If parent provides onReset, use it (this will reset both JSON editor and visual builder)
    if (onReset) {
      onReset();
      return;
    }

    // Fallback: reset only this panel (for standalone usage)
    const original = JSON.parse(JSON.stringify(originalSectionRef.current)); // Deep copy to ensure new reference

    // Update state immediately
    setJsonData(original);
    setRawJsonText(JSON.stringify(original, null, 2));

    // Notify parent
    onChange(original);
  }, [onChange, onReset]);

  // Handle Escape key to close preview
  useEffect(() => {
    if (!showPreview) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPreview(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showPreview]);

  // Make section editable for preview - remove readonly flags from widgets
  const makeSectionEditable = useCallback((section: SectionConfig): SectionConfig => {
    const processWidget = (widget: any): any => {
      if (!widget || typeof widget !== 'object') return widget;

      const editableWidget = {
        ...widget,
        'widget-readonly': false, // Make all widgets editable in preview
      };

      // Process nested widgets
      if (widget.widgets && Array.isArray(widget.widgets)) {
        editableWidget.widgets = widget.widgets.map(processWidget);
      }

      if (widget['widget-item']) {
        editableWidget['widget-item'] = processWidget(widget['widget-item']);
      }

      // Process table columns
      if (widget['widget-data-columns'] && Array.isArray(widget['widget-data-columns'])) {
        editableWidget['widget-data-columns'] = widget['widget-data-columns'].map((col: any) => {
          if (col && typeof col === 'object' && col.widget) {
            return processWidget(col);
          }
          return col;
        });
      }

      return editableWidget;
    };

    const processPanel = (panel: any): any => {
      if (!panel || typeof panel !== 'object') return panel;

      const editablePanel = { ...panel };

      if (panel.widgets && Array.isArray(panel.widgets)) {
        editablePanel.widgets = panel.widgets.map(processWidget);
      }

      if (panel.panels && Array.isArray(panel.panels)) {
        editablePanel.panels = panel.panels.map(processPanel);
      }

      return editablePanel;
    };

    return {
      ...section,
      'section-editable': true,
      panels: section.panels ? section.panels.map(processPanel) : [],
    };
  }, []);

  // Auto-populate widget-type based on widget selection
  const autoPopulateWidgetType = useCallback((data: any): any => {
    if (!data || typeof data !== 'object') return data;

    const processWidget = (widget: any): any => {
      if (!widget || typeof widget !== 'object') return widget;

      const widgetType = widget.widget;
      if (widgetType && !widget['widget-type']) {
        // Auto-determine widget-type based on widget name
        const widgetTypeMap: Record<string, 'input' | 'layout' | 'table' | 'group'> = {
          'text': 'input',
          'textarea': 'input',
          'number': 'input',
          'boolean': 'input',
          'date': 'input',
          'datetime': 'input',
          'select': 'input',
          'radio': 'input',
          'checkbox': 'input',
          'file': 'input',
          'phone': 'input',
          'currency': 'input',
          'display': 'input',
          'table': 'table',
          'simple-table': 'table',
          'array-widget': 'group',
          'iterable-accordion': 'group',
          'profile': 'layout',
        };

        widget = {
          ...widget,
          'widget-type': widgetTypeMap[widgetType] || 'input',
        };
      }

      // Process nested widgets
      if (widget.widgets && Array.isArray(widget.widgets)) {
        widget = {
          ...widget,
          widgets: widget.widgets.map(processWidget),
        };
      }

      // Process widget-item
      if (widget['widget-item']) {
        widget = {
          ...widget,
          'widget-item': processWidget(widget['widget-item']),
        };
      }

      // Process table columns
      if (widget['widget-data-columns'] && Array.isArray(widget['widget-data-columns'])) {
        widget = {
          ...widget,
          'widget-data-columns': widget['widget-data-columns'].map((col: any) => {
            if (col && typeof col === 'object' && col.widget && !col['widget-type']) {
              const widgetTypeMap: Record<string, 'input' | 'layout' | 'table' | 'group'> = {
                'text': 'input',
                'number': 'input',
                'date': 'input',
                'select': 'input',
                'boolean': 'input',
              };
              return {
                ...col,
                'widget-type': widgetTypeMap[col.widget] || 'input',
              };
            }
            return col;
          }),
        };
      }

      return widget;
    };

    const processPanel = (panel: any): any => {
      if (!panel || typeof panel !== 'object') return panel;

      let processed = { ...panel };

      // Process widgets in panel
      if (processed.widgets && Array.isArray(processed.widgets)) {
        processed.widgets = processed.widgets.map(processWidget);
      }

      // Process nested panels
      if (processed.panels && Array.isArray(processed.panels)) {
        processed.panels = processed.panels.map(processPanel);
      }

      return processed;
    };

    // Process section
    if (data.panels && Array.isArray(data.panels)) {
      return {
        ...data,
        panels: data.panels.map(processPanel),
      };
    }

    return data;
  }, []);

  // Raw-only editor: structured editor removed.

  const validateText = useCallback(
    (text: string): { isValid: boolean; errors: string[]; parsed?: SectionConfig } => {
      try {
        const parsed = JSON.parse(text);
        const processed = autoPopulateWidgetType(parsed);
        const validation = validateSection(processed);
        return { isValid: validation.isValid, errors: validation.errors, parsed: processed };
      } catch (error) {
        return {
          isValid: false,
          errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`],
        };
      }
    },
    [autoPopulateWidgetType]
  );

  const handleRawJsonChange = useCallback(
    (text: string) => {
      setRawJsonText(text);
      onRawDraftChange?.(text);

      // Validate only (do not apply)
      const v = validateText(text);
      setValidationErrors(v.errors);
      setCanApply(v.isValid);
      onRawValidationChange?.({ isValid: v.isValid, errors: v.errors });

      // Keep jsonData in sync only when valid, for preview purposes (but do not emit onChange)
      if (v.isValid && v.parsed) {
        setJsonData(v.parsed);
      }
    },
    [onRawDraftChange, onRawValidationChange, validateText]
  );

  const handleValidate = useCallback(() => {
    const v = validateText(rawJsonText);
    setValidationErrors(v.errors);
    setCanApply(v.isValid);
    onRawValidationChange?.({ isValid: v.isValid, errors: v.errors });
    if (v.isValid && v.parsed) {
      setJsonData(v.parsed);
    }
  }, [onRawValidationChange, rawJsonText, validateText]);

  const handleFormat = useCallback(() => {
    const v = validateText(rawJsonText);
    if (!v.isValid || !v.parsed) {
      setValidationErrors(v.errors);
      setCanApply(false);
      onRawValidationChange?.({ isValid: false, errors: v.errors });
      return;
    }
    const formatted = JSON.stringify(v.parsed, null, 2);
    setRawJsonText(formatted);
    onRawDraftChange?.(formatted);
    setJsonData(v.parsed);
    setValidationErrors([]);
    setCanApply(true);
    onRawValidationChange?.({ isValid: true, errors: [] });
  }, [onRawDraftChange, onRawValidationChange, rawJsonText, validateText]);

  const handleApply = useCallback(() => {
    const v = validateText(rawJsonText);
    setValidationErrors(v.errors);
    setCanApply(v.isValid);
    onRawValidationChange?.({ isValid: v.isValid, errors: v.errors });
    if (!v.isValid || !v.parsed) return;
    setJsonData(v.parsed);
    onChange(v.parsed);
  }, [onChange, onRawValidationChange, rawJsonText, validateText]);

  // Raw-only editor: no structured editor toggle.

  // Raw-only editor: enum config removed.

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        borderRight: '0px',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          background: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontWeight: 600, fontSize: '16px', color: '#2c3e50' }}>
            JSON Editor
          </div>
          {validationErrors.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#28a745' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#28a745',
                }}
              />
              <span style={{ fontSize: '12px' }}>Valid JSON Schema</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#e74c3c' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#e74c3c',
                }}
              />
              <span style={{ fontSize: '12px' }}>Validation Errors</span>
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            onClick={handleReset}
            style={{
              padding: '6px 12px',
              border: '1px solid #ddd',
              borderRadius: '10px',
              background: '#f3f3f3',
              color: '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f8f9fa';
              e.currentTarget.style.borderColor = '#999';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = '#ddd';
            }}
            title="Reset to original JSON"
          >
            <img
              src={resetIcon}
              alt="Reset"
              className="w-3.5 h-3.5 grayscale opacity-70"
            />
            Reset
          </button>
          <button
            type="button"
            onClick={handleValidate}
            style={{
              padding: '6px 12px',
              border: '1px solid #ddd',
              borderRadius: '10px',
              background: 'white',
              color: '#111827',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            Validate
          </button>
          <button
            type="button"
            onClick={handleFormat}
            style={{
              padding: '6px 12px',
              border: '1px solid #ddd',
              borderRadius: '10px',
              background: 'white',
              color: '#111827',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            Format
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '10px',
              background: canApply ? '#111827' : '#9ca3af',
              color: 'white',
              cursor: canApply ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            Apply
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          maxHeight: '100%',
          overflow: 'hidden',
          background: 'white',
          border: '1px solid #E1E1E1',
          borderRadius: '10px',
          padding: '0',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <textarea
          value={rawJsonText}
          onChange={(e) => handleRawJsonChange(e.target.value)}
          style={{
            width: '100%',
            height: '100%',
            background: 'white',
            color: '#333',
            border: 'none',
            padding: '20px',
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, "source-code-pro", monospace',
            fontSize: '13px',
            lineHeight: '1.5',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            borderRadius: '10px',
          }}
          spellCheck={false}
        />
      </div>
      {showPreview && createPortal(
        <div
          className="section-builder-preview-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setShowPreview(false)}
        >
          <div
            className="section-builder-preview-modal"
            style={{
              background: 'white',
              borderRadius: '8px',
              width: '100%',
              minWidth: '700px', // Ensure enough width for 600px content + padding
              maxWidth: '90vw',
              height: '90vh',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="section-builder-preview-header"
              style={{
                padding: '15px 20px',
                borderBottom: '1px solid #ddd',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8f9fa',
              }}
            >
              <h2 className="section-builder-preview-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#2c3e50' }}>
                Section Preview
              </h2>
              <button
                className="section-builder-preview-close"
                onClick={() => setShowPreview(false)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  background: '#e74c3c',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
            <div
              className="section-builder-preview-content"
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '20px',
              }}
            >
              <Provider store={previewStore}>
                <WidgetProvider
                  store={previewStore}
                  dataSourceRequestHandler={widgetContext.dataSourceRequestHandler}
                  schemaData={widgetContext.schemaData}
                  translate={widgetContext.translate}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <SectionRenderer
                      section={makeSectionEditable(jsonData)}
                      hideEditButton={true} // Hide edit button in preview - widgets are already editable
                      onValueChange={(widgetId, value) => {
                        // Handle value changes in preview (optional - for tracking)
                        console.log('Preview value changed:', widgetId, value);
                      }}
                    />
                  </div>
                </WidgetProvider>
              </Provider>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
