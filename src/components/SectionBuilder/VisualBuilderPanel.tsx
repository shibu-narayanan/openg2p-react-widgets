import React from 'react';
import { SectionConfig, PanelConfig, BaseWidgetConfig } from '../../types';
import { SectionTree, TreeNode } from './SectionTree';
import { PropertyEditor } from './PropertyEditor';
import { maximizeIcon, minimizeIcon } from '../../assets';
import { validateSection } from './validate/validateSection';
import { WIDGET_TYPES } from './schemas';

interface VisualBuilderPanelProps {
  section: SectionConfig;
  selectedNode: TreeNode | null;
  onSelectNode: (node: TreeNode | null) => void;
  onSectionChange: (section: SectionConfig) => void;
  onAddPanel: (parentId: string, parentType: 'section' | 'panel' | 'widget') => void;
  onAddWidget: (parentId: string) => void;
  onDeleteNode: (node: TreeNode) => void;
  onDuplicateNode: (node: TreeNode) => void;
  onMoveNode?: (args: {
    kind: 'panel' | 'widget';
    parentPanelId: string | null;
    activeId: string;
    overId: string;
  }) => void;
  onSave?: (section: SectionConfig) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

/**
 * Visual Builder Panel - Right side of Section Builder
 */
export const VisualBuilderPanel: React.FC<VisualBuilderPanelProps> = ({
  section,
  selectedNode,
  onSelectNode,
  onSectionChange,
  onAddPanel,
  onAddWidget,
  onDeleteNode,
  onDuplicateNode,
  onMoveNode,
  onSave,
  isMaximized = false,
  onToggleMaximize,
}) => {
  const handleSave = () => {
    const validation = validateSection(section);
    if (!validation.isValid) {
      console.error('Section validation failed:', validation.errors);
      alert(`Cannot save section. Please fix the following errors:\n\n${validation.errors.join('\n')}`);
      return;
    }

    if (onSave) {
      try {
        onSave(section);
      } catch (error) {
        console.error('Error saving section:', error);
        alert('An error occurred while saving the section. Please check the console for details.');
      }
    }
  };

  const handleNodeChange = (node: TreeNode, updates: Partial<SectionConfig | PanelConfig | BaseWidgetConfig>) => {
    // Create a deep copy of the section
    const updatedSection = JSON.parse(JSON.stringify(section));

    // Find and update the node in the section structure
    const updateInSection = (current: any, targetId: string, targetType: string): boolean => {
      if (targetType === 'section' && current['section-id'] === targetId) {
        Object.assign(current, updates);
        return true;
      }

      if (current.panels) {
        for (const panel of current.panels) {
          if (targetType === 'panel' && panel['panel-id'] === targetId) {
            Object.assign(panel, updates);
            return true;
          }
          if (updateInSection(panel, targetId, targetType)) {
            return true;
          }
          if (panel.widgets) {
            for (const widget of panel.widgets) {
              if (targetType === 'widget' && widget['widget-id'] === targetId) {
                Object.assign(widget, updates);
                return true;
              }
            }
          }
        }
      }

      if (current.widgets) {
        for (const widget of current.widgets) {
          if (targetType === 'widget' && widget['widget-id'] === targetId) {
            Object.assign(widget, updates);
            return true;
          }
        }
      }

      return false;
    };

    updateInSection(updatedSection, node.id, node.type);
    onSectionChange(updatedSection);
  };

  const handleAddPanel = () => {
    if (selectedNode) {
      if (selectedNode.type === 'section' || selectedNode.type === 'panel') {
        onAddPanel(selectedNode.id, selectedNode.type);
      }
    } else {
      // Add to root section
      onAddPanel(section['section-id'], 'section');
    }
  };

  const handleAddWidget = () => {
    if (selectedNode) {
      if (selectedNode.type === 'panel') {
        onAddWidget(selectedNode.id);
      } else if (selectedNode.type === 'section') {
        // Find first panel or create one
        if (section.panels && section.panels.length > 0) {
          onAddWidget(section.panels[0]['panel-id']);
        } else {
          // Create a panel first, then add widget
          const newPanel: PanelConfig = {
            'panel-id': `panel-${Date.now()}`,
            'panel-orientation': 'vertical',
            widgets: [],
          };
          const updatedSection = {
            ...section,
            panels: [...(section.panels || []), newPanel],
          };
          onSectionChange(updatedSection);
          onAddWidget(newPanel['panel-id']);
        }
      }
    } else {
      // Add to first panel or create one
      if (section.panels && section.panels.length > 0) {
        onAddWidget(section.panels[0]['panel-id']);
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        paddingBottom: '10px',
        borderRight: '0px',
      }}
    >
      <div
        style={{
          padding: '20px 20px 20px 20px',

          background: 'var(--owt-color-bg, #FFFFFF)',

          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--owt-color-text, #011627)', paddingTop: '5px' }}>
          Visual Builder
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleAddPanel}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--owt-color-border, #C4C4C4)',
              borderRadius: '10px',
              background: 'var(--owt-btn-primary-bg, #FFFFFF)',
              color: 'var(--owt-btn-primary-color, #011627)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '12px',
              whiteSpace: 'nowrap',
            }}
          >
            + Add Panel
          </button>
          <button
            onClick={handleAddWidget}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--owt-color-border, #C4C4C4)',
              borderRadius: '10px',
              background: 'var(--owt-btn-primary-bg, #FFFFFF)',
              color: 'var(--owt-btn-primary-color, #011627)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '12px',
              whiteSpace: 'nowrap',
            }}
          >
            + Add Widget
          </button>
          {onSave && (
            <button
              onClick={handleSave}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '10px',
                background: 'var(--owt-color-text, #011627)',
                color: 'var(--owt-color-bg, #FFFFFF)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              Save
            </button>
          )}
          {onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              style={{
                padding: '8px',
                border: 'none',
                borderRadius: '4px',
                background: 'transparent',
                color: 'var(--owt-color-text-muted, #727474)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
              }}
              title={isMaximized ? 'Minimize' : 'Maximize'}
            >
              {isMaximized ? (
                <img src={minimizeIcon} alt="Minimize" width="16" height="16" />
              ) : (
                <img src={maximizeIcon} alt="Maximize" width="16" height="16" />
              )}
            </button>
          )}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          border: '1px solid var(--owt-color-border, #C4C4C4)',
          borderRadius: '10px',
          minHeight: 0, // Important for flex children to respect overflow
        }}
      >
        {/* Tree View */}
        <div
          style={{
            width: '45%',
            borderRight: '1px solid var(--owt-color-border, #C4C4C4)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0, // Important for flex children to respect overflow
            overflow: 'hidden',
          }}
        >
          {/* Simple palette (click-to-add) */}
          <div style={{ padding: '12px 15px', borderBottom: '1px solid var(--owt-color-border-light, #E4E4E4)', background: 'var(--owt-color-bg, #FFFFFF)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--owt-color-text, #011627)', marginBottom: '8px' }}>
              Widget Palette
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(['text', 'number', 'date', 'select', 'textarea'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    // Palette adds a widget to the selected panel (or falls back to +Add Widget behavior)
                    if (selectedNode?.type === 'panel') {
                      onAddWidget(selectedNode.id);
                      // The actual widget type is edited in PropertyEditor after selection.
                    } else {
                      handleAddWidget();
                    }
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '9999px',
                    border: '1px solid var(--owt-color-border, #C4C4C4)',
                    background: 'var(--owt-color-bg, #FFFFFF)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--owt-color-text, #011627)',
                  }}
                  title={`Add ${w}`}
                >
                  {w}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--owt-color-text-muted, #727474)' }}>
              Tip: select a panel first to control where widgets land.
            </div>
          </div>
          <SectionTree
            section={section}
            selectedNode={selectedNode}
            onSelectNode={onSelectNode}
            onAddPanel={onAddPanel}
            onAddWidget={onAddWidget}
            onDeleteNode={onDeleteNode}
            onDuplicateNode={onDuplicateNode}
            onMoveNode={onMoveNode}
          />
        </div>

        {/* Properties Panel */}
        <div
          style={{
            width: '55%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0, // Important for flex children to respect overflow
            overflow: 'hidden',
          }}
        >
          <PropertyEditor
            node={selectedNode}
            onChange={handleNodeChange}
            onDelete={onDeleteNode}
            onDuplicate={onDuplicateNode}
          />
        </div>
      </div>
    </div>
  );
};
