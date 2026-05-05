import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Provider } from 'react-redux';
import { SectionConfig, PanelConfig, BaseWidgetConfig } from '../../types';
import { JSONEditorPanel } from './JSONEditorPanel';
import { VisualBuilderPanel } from './VisualBuilderPanel';
import { TreeNode } from './SectionTree';
import { SectionRenderer } from '../SectionRenderer';
import { WidgetProvider, useWidgetContext } from '../WidgetProvider';
import { createWidgetStore } from '../../store';

export interface SectionBuilderProps {
  initialSection?: SectionConfig;
  onChange?: (section: SectionConfig) => void;
  onSave?: (section: SectionConfig) => void;
}

type BuilderMode = 'graphical' | 'raw';

/**
 * Main Section Builder Component
 * Provides mutually-exclusive editing modes (Graphical or Raw JSON).
 */
export const SectionBuilder: React.FC<SectionBuilderProps> = ({
  initialSection,
  onChange,
  onSave,
}) => {
  const defaultSection: SectionConfig = {
    'section-id': 'new-section',
    'section-title': '',
    'section-editable': false,
    panels: [],
  };

  const [section, setSection] = useState<SectionConfig>(
    initialSection || defaultSection
  );
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [mode, setMode] = useState<BuilderMode>('graphical');
  const [rawDraft, setRawDraft] = useState<string>('');
  const [rawIsValid, setRawIsValid] = useState<boolean>(true);
  const [rawErrors, setRawErrors] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  
  // Store the original section for reset functionality
  const originalSectionRef = useRef<SectionConfig>(
    initialSection ? JSON.parse(JSON.stringify(initialSection)) : defaultSection
  );
  const isInitialMount = useRef(true);

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

  // Create a store for the preview modal if we're not already in a Provider
  const previewStore = useMemo(() => createWidgetStore(), []);

  // Make section editable for preview - remove readonly flags from widgets
  const makeSectionEditable = useCallback((s: SectionConfig): SectionConfig => {
    const processWidget = (widget: any): any => {
      if (!widget || typeof widget !== 'object') return widget;

      const editableWidget = {
        ...widget,
        'widget-readonly': false,
      };

      if (widget.widgets && Array.isArray(widget.widgets)) {
        editableWidget.widgets = widget.widgets.map(processWidget);
      }
      if (widget['widget-item']) {
        editableWidget['widget-item'] = processWidget(widget['widget-item']);
      }
      if (widget['widget-data-columns'] && Array.isArray(widget['widget-data-columns'])) {
        editableWidget['widget-data-columns'] = widget['widget-data-columns'].map((col: any) => {
          if (col && typeof col === 'object' && col.widget) return processWidget(col);
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
      ...s,
      panels: Array.isArray(s.panels) ? s.panels.map(processPanel) : [],
    };
  }, []);

  useEffect(() => {
    if (initialSection) {
      // Only update original on initial mount
      if (isInitialMount.current) {
        originalSectionRef.current = JSON.parse(JSON.stringify(initialSection));
        isInitialMount.current = false;
      }
      setSection(initialSection);
      if (mode === 'raw') {
        setRawDraft(JSON.stringify(initialSection, null, 2));
      }
    }
  }, [initialSection, mode]);

  const handleSectionChange = useCallback(
    (updatedSection: SectionConfig) => {
      setSection(updatedSection);
      if (onChange) {
        onChange(updatedSection);
      }
    },
    [onChange]
  );

  // Reset to original section - resets both JSON editor and visual builder
  const handleReset = useCallback(() => {
    const original = JSON.parse(JSON.stringify(originalSectionRef.current));
    setSection(original);
    setSelectedNode(null); // Clear selection on reset
    setRawDraft(JSON.stringify(original, null, 2));
    setRawErrors([]);
    setRawIsValid(true);
    if (onChange) {
      onChange(original);
    }
  }, [onChange]);

  const handleAddPanel = useCallback(
    (parentId: string, parentType: 'section' | 'panel' | 'widget') => {
      const updatedSection = JSON.parse(JSON.stringify(section));
      const newPanel: PanelConfig = {
        'panel-id': `panel-${Date.now()}`,
        'panel-orientation': 'vertical',
        widgets: [],
      };

      if (parentType === 'section') {
        updatedSection.panels = [...(updatedSection.panels || []), newPanel];
      } else if (parentType === 'panel') {
        const addPanelToParent = (panels: PanelConfig[]): boolean => {
          for (const panel of panels) {
            if (panel['panel-id'] === parentId) {
              panel.panels = [...(panel.panels || []), newPanel];
              return true;
            }
            if (panel.panels && addPanelToParent(panel.panels)) {
              return true;
            }
          }
          return false;
        };
        if (updatedSection.panels) {
          addPanelToParent(updatedSection.panels);
        }
      }

      handleSectionChange(updatedSection);
    },
    [section, handleSectionChange]
  );

  const handleAddWidget = useCallback(
    (parentId: string) => {
      const updatedSection = JSON.parse(JSON.stringify(section));
      const newWidget: BaseWidgetConfig = {
        widget: 'text',
        'widget-id': `widget-${Date.now()}`,
        'widget-label': 'New Widget',
        'widget-data-path': '',
      };

      const addWidgetToPanel = (panels: PanelConfig[]): boolean => {
        for (const panel of panels) {
          if (panel['panel-id'] === parentId) {
            panel.widgets = [...(panel.widgets || []), newWidget];
            return true;
          }
          if (panel.panels && addWidgetToPanel(panel.panels)) {
            return true;
          }
        }
        return false;
      };

      if (updatedSection.panels) {
        addWidgetToPanel(updatedSection.panels);
      }

      handleSectionChange(updatedSection);
    },
    [section, handleSectionChange]
  );

  const handleDeleteNode = useCallback(
    (node: TreeNode) => {
      const updatedSection = JSON.parse(JSON.stringify(section));

      if (node.type === 'section') {
        // Can't delete section, but can reset it
        return;
      }

      const deleteFromSection = (current: any): boolean => {
        if (current.panels) {
          const panelIndex = current.panels.findIndex(
            (p: PanelConfig) => p['panel-id'] === node.id
          );
          if (panelIndex !== -1 && node.type === 'panel') {
            current.panels.splice(panelIndex, 1);
            return true;
          }

          for (const panel of current.panels) {
            if (panel['panel-id'] === node.id && node.type === 'panel') {
              // This shouldn't happen due to findIndex above, but handle nested case
              const index = current.panels.indexOf(panel);
              if (index !== -1) {
                current.panels.splice(index, 1);
                return true;
              }
            }

            if (panel.widgets) {
              const widgetIndex = panel.widgets.findIndex(
                (w: BaseWidgetConfig) => w['widget-id'] === node.id
              );
              if (widgetIndex !== -1 && node.type === 'widget') {
                panel.widgets.splice(widgetIndex, 1);
                return true;
              }
            }

            if (panel.panels && deleteFromSection(panel)) {
              return true;
            }
          }
        }

        return false;
      };

      deleteFromSection(updatedSection);
      handleSectionChange(updatedSection);
      setSelectedNode(null);
    },
    [section, handleSectionChange]
  );

  const handleDuplicateNode = useCallback(
    (node: TreeNode) => {
      const updatedSection = JSON.parse(JSON.stringify(section));

      if (node.type === 'section') {
        return;
      }

      const duplicateInSection = (current: any): boolean => {
        if (current.panels) {
          for (const panel of current.panels) {
            if (panel['panel-id'] === node.id && node.type === 'panel') {
              const duplicated: PanelConfig = {
                ...panel,
                'panel-id': `${panel['panel-id']}-copy-${Date.now()}`,
              };
              const index = current.panels.indexOf(panel);
              current.panels.splice(index + 1, 0, duplicated);
              return true;
            }

            if (panel.widgets) {
              for (const widget of panel.widgets) {
                if (widget['widget-id'] === node.id && node.type === 'widget') {
                  const duplicated: BaseWidgetConfig = {
                    ...widget,
                    'widget-id': `${widget['widget-id']}-copy-${Date.now()}`,
                  };
                  const index = panel.widgets.indexOf(widget);
                  panel.widgets.splice(index + 1, 0, duplicated);
                  return true;
                }
              }
            }

            if (panel.panels && duplicateInSection(panel)) {
              return true;
            }
          }
        }
        return false;
      };

      duplicateInSection(updatedSection);
      handleSectionChange(updatedSection);
    },
    [section, handleSectionChange]
  );

  const handleMoveNode = useCallback(
    (args: { kind: 'panel' | 'widget'; parentPanelId: string | null; activeId: string; overId: string }) => {
      const updatedSection: SectionConfig = JSON.parse(JSON.stringify(section));

      const findPanelById = (panels: PanelConfig[] | undefined, id: string): PanelConfig | null => {
        if (!panels) return null;
        for (const p of panels) {
          if (p['panel-id'] === id) return p;
          const found = findPanelById(p.panels, id);
          if (found) return found;
        }
        return null;
      };

      const moveWithin = <T,>(arr: T[], fromIdx: number, toIdx: number): T[] => {
        const copy = arr.slice();
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, moved);
        return copy;
      };

      if (args.kind === 'panel') {
        const container =
          args.parentPanelId === null
            ? updatedSection
            : findPanelById(updatedSection.panels, args.parentPanelId);
        if (!container || !Array.isArray((container as any).panels)) return;
        const panelsArr: PanelConfig[] = (container as any).panels;
        const fromIdx = panelsArr.findIndex((p) => p['panel-id'] === args.activeId);
        const toIdx = panelsArr.findIndex((p) => p['panel-id'] === args.overId);
        if (fromIdx < 0 || toIdx < 0) return;
        (container as any).panels = moveWithin(panelsArr, fromIdx, toIdx);
      } else {
        const parentPanel = findPanelById(updatedSection.panels, args.parentPanelId ?? '');
        if (!parentPanel || !Array.isArray(parentPanel.widgets)) return;
        const widgetsArr: BaseWidgetConfig[] = parentPanel.widgets;
        const fromIdx = widgetsArr.findIndex((w) => w['widget-id'] === args.activeId);
        const toIdx = widgetsArr.findIndex((w) => w['widget-id'] === args.overId);
        if (fromIdx < 0 || toIdx < 0) return;
        parentPanel.widgets = moveWithin(widgetsArr, fromIdx, toIdx);
      }

      handleSectionChange(updatedSection);
    },
    [section, handleSectionChange]
  );

  const toggleMaximize = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  const switchToGraphical = useCallback(() => {
    if (mode === 'graphical') return;
    // Require Raw JSON to be applied and valid before switching back.
    if (!rawIsValid) {
      alert(`Cannot switch to Graphical mode.\n\nFix errors first:\n- ${rawErrors.join('\n- ')}`);
      return;
    }
    setMode('graphical');
  }, [mode, rawErrors, rawIsValid]);

  const switchToRaw = useCallback(() => {
    if (mode === 'raw') return;
    setRawDraft(JSON.stringify(section, null, 2));
    setRawErrors([]);
    setRawIsValid(true);
    setMode('raw');
    setSelectedNode(null);
  }, [mode, section]);

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    if (!isMaximized) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMaximized(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isMaximized]);

  return (
    <>
      {isMaximized && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9998,
          }}
          onClick={toggleMaximize}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: isMaximized ? '100vh' : '100%',
          width: isMaximized ? '100vw' : '100%',
          minHeight: 0,
          background: 'var(--owt-color-bg, #FFFFFF)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          overflow: 'hidden',
          border: 'none',
          position: isMaximized ? 'fixed' : 'relative',
          top: isMaximized ? 0 : 'auto',
          left: isMaximized ? 0 : 'auto',
          zIndex: isMaximized ? 9999 : 'auto',
        }}
      >
        {/* Top Bar */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--owt-color-border-light, #E4E4E4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--owt-color-bg, #FFFFFF)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--owt-color-text, #011627)' }}>Section Builder</div>
            <div style={{ display: 'flex', gap: '6px', background: 'var(--owt-color-bg-alt, #F6F6F6)', padding: '4px', borderRadius: '9999px' }}>
              <button
                type="button"
                onClick={switchToGraphical}
                style={{
                  padding: '6px 10px',
                  borderRadius: '9999px',
                  border: 'none',
                  cursor: 'pointer',
                  background: mode === 'graphical' ? 'var(--owt-color-text, #011627)' : 'transparent',
                  color: mode === 'graphical' ? 'var(--owt-color-bg, #FFFFFF)' : 'var(--owt-color-text, #011627)',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                Graphical
              </button>
              <button
                type="button"
                onClick={switchToRaw}
                style={{
                  padding: '6px 10px',
                  borderRadius: '9999px',
                  border: 'none',
                  cursor: 'pointer',
                  background: mode === 'raw' ? 'var(--owt-color-text, #011627)' : 'transparent',
                  color: mode === 'raw' ? 'var(--owt-color-bg, #FFFFFF)' : 'var(--owt-color-text, #011627)',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                Raw JSON
              </button>
            </div>
            {mode === 'raw' && !rawIsValid && (
              <div style={{ fontSize: '12px', color: 'var(--owt-color-error, #B91C1C)', fontWeight: 600 }}>
                Fix errors to switch back to Graphical
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'var(--owt-color-primary-accent, #EE7C22)',
                color: 'var(--owt-color-bg, #FFFFFF)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
              }}
              title="Preview Section"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid var(--owt-color-border, #C4C4C4)',
                background: 'var(--owt-color-bg, #FFFFFF)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--owt-color-text, #011627)',
              }}
            >
              Reset
            </button>
            {onSave && (
              <button
                type="button"
                onClick={() => onSave(section)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--owt-color-text, #011627)',
                  color: 'var(--owt-color-bg, #FFFFFF)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                Save
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {mode === 'raw' ? (
            <div style={{ width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex' }}>
              <JSONEditorPanel
                section={section}
                onChange={handleSectionChange}
                onReset={handleReset}
                mode="raw"
                rawDraft={rawDraft}
                onRawDraftChange={setRawDraft}
                onRawValidationChange={(next) => {
                  setRawIsValid(next.isValid);
                  setRawErrors(next.errors);
                }}
              />
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex' }}>
              <VisualBuilderPanel
                section={section}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
                onSectionChange={handleSectionChange}
                onAddPanel={handleAddPanel}
                onAddWidget={handleAddWidget}
                onDeleteNode={handleDeleteNode}
                onDuplicateNode={handleDuplicateNode}
                onMoveNode={handleMoveNode}
                onSave={onSave}
                isMaximized={isMaximized}
                onToggleMaximize={toggleMaximize}
              />
            </div>
          )}
        </div>
      </div>
      {showPreview && createPortal(
        <div
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
            style={{
              background: 'var(--owt-color-bg, #FFFFFF)',
              borderRadius: '8px',
              width: '100%',
              minWidth: '700px',
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
              style={{
                padding: '15px 20px',
                borderBottom: '1px solid var(--owt-color-border-light, #E4E4E4)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--owt-color-bg-alt, #F6F6F6)',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--owt-color-text, #011627)' }}>
                Preview
              </h2>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '5px 10px',
                  color: 'var(--owt-color-text-muted, #727474)',
                }}
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              <Provider store={previewStore}>
                <WidgetProvider
                  store={previewStore}
                  dataSourceRequestHandler={widgetContext.dataSourceRequestHandler}
                  schemaData={widgetContext.schemaData}
                  translate={widgetContext.translate}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <SectionRenderer
                      section={makeSectionEditable(section)}
                      hideEditButton={true}
                    />
                  </div>
                </WidgetProvider>
              </Provider>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
