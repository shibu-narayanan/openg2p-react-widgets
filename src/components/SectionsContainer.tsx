import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useStore, useDispatch, useSelector } from 'react-redux';
import { SectionConfig, DataSourceRequestHandler } from '../types';
import { UseBaseWidgetOptions } from '../hooks/useBaseWidget';
import { SectionRenderer, SectionChanges } from './SectionRenderer';
import { useWidgetContext } from './WidgetProvider';
import { WidgetRootState } from '../store';
import { sectionValidate } from '../utils/sectionValidate';
import { applySectionDataRoot, namespaceSectionConfig } from '../utils/schemaNamespace';
import { buildSectionChanges } from '../utils/buildSectionChanges';

export type SectionMode = 'RegistryView' | 'CRView' | 'IntakeForm';

/** Form controls passed to host via onFormReady. Allows host to validate and get all section data (e.g. on Submit). */
export interface SectionsFormHandle {
  /** Validate all sections. Returns true if valid, false otherwise. */
  validate(): Promise<boolean>;
  /** Get raw form data from store for all sections (no validation). */
  getFormData(): Record<string, unknown>;
  /** Validate all sections. If valid, returns SectionChanges[]; if invalid, throws. */
  validateAndGetData(): Promise<SectionChanges[]>;
/**
 * Used for form save-draft functionality.
 * Retrieves record and file changes without validation.
 */
  getStructuredData(): SectionChanges[];
}

export interface SectionsContainerProps {
  sections: SectionConfig[];
  dataSourceRequestHandler?: DataSourceRequestHandler;
  schemaData?: UseBaseWidgetOptions['schemaData'];
  onValueChange?: UseBaseWidgetOptions['onValueChange'];
  className?: string;
  onSectionSave?: (changes: SectionChanges) => Promise<void> | void;
  hideEditButton?: boolean; // Hide the edit button band below sections
  mode?: SectionMode; // Display mode: 'RegistryView' (default), 'CRView', or 'IntakeForm'
  /** IntakeForm mode: when true or undefined, sections are editable; when false, sections are readonly */
  isDraft?: boolean;
  namespace?: string | ((sectionId: string, index: number) => string); // Optional namespace for widget IDs. If string, applied to all sections. If function, called per section.
  // CRView data is read from schemaData with keys: createdBy, createdDate, approvedBy, approvedDate. IntakeForm displays sections as accordion for registration forms.
  /** Called when a section's dirty (has unsaved changes) status changes. Only fires while the section is in edit mode. */
  onSectionDirtyChange?: (sectionId: string, isDirty: boolean) => void;
  /** Called when the form is ready. Passes form controls (validate, getFormData, validateAndGetData) so the host can trigger submit from its own button. */
  onFormReady?: (handle: SectionsFormHandle) => void;
}

/**
 * Recursively check if a panel contains a table widget
 */
const hasTableWidget = (panels: SectionConfig['panels']): boolean => {
  for (const panel of panels) {
    // Check widgets in this panel
    if (panel.widgets) {
      for (const widget of panel.widgets) {
        if (
          widget.widget === 'table' ||
          widget.widget === 'dialog-table' ||
          widget['widget-type'] === 'table'
        ) {
          return true;
        }
      }
    }
    // Recursively check nested panels
    if (panel.panels) {
      if (hasTableWidget(panel.panels)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Recursively get table widget column span from panels
 */
const getTableWidgetColumnSpan = (panels: SectionConfig['panels']): number | null => {
  for (const panel of panels) {
    // Check widgets in this panel
    if (panel.widgets) {
      for (const widget of panel.widgets) {
        if (
          widget.widget === 'table' ||
          widget.widget === 'dialog-table' ||
          widget['widget-type'] === 'table'
        ) {
          // Return the widget's column span if specified, otherwise null
          return widget['widget-column-span'] || null;
        }
      }
    }
    // Recursively check nested panels
    if (panel.panels) {
      const nestedSpan = getTableWidgetColumnSpan(panel.panels);
      if (nestedSpan !== null) {
        return nestedSpan;
      }
    }
  }
  return null;
};

/**
 * Recursively count all vertical panels in a section
 * Handles nested structure: horizontal panels containing vertical panels
 * Accounts for panel-column-span: a panel with column-span 3 counts as 3 columns
 */
const countVerticalPanels = (panels: SectionConfig['panels']): number => {
  let count = 0;
  for (const panel of panels) {
    const orientation = panel['panel-orientation'] || 'vertical';

    if (orientation === 'horizontal' && panel.panels) {
      // For horizontal panels, count all vertical panels nested inside
      count += countVerticalPanels(panel.panels);
    } else if (orientation === 'vertical') {
      // Count this vertical panel, accounting for column span
      const columnSpan = panel['panel-column-span'] || 1;
      count += columnSpan;
      // Also recursively count vertical panels nested inside this vertical panel
      if (panel.panels && panel.panels.length > 0) {
        count += countVerticalPanels(panel.panels);
      }
    }
  }
  return count;
};

/**
 * Container component that renders multiple sections
 * 
 * Layout behavior:
 * - Uses CSS Grid for proper alignment
 * - Each grid column = 200px (one vertical panel width)
 * - Sections span columns based on their total vertical panel count
 * - All sections align to the same grid, ensuring right-side alignment
 * - Handles nested structure: multiple horizontal panels, each with multiple vertical panels
 */
export const SectionsContainer = ({
  sections,
  dataSourceRequestHandler: propDataSourceRequestHandler,
  schemaData,
  onValueChange,
  className = '',
  onSectionSave,
  hideEditButton = false,
  mode = 'RegistryView',
  isDraft,
  namespace,
  onSectionDirtyChange,
  onFormReady,
}: SectionsContainerProps) => {
  const store = useStore();
  const dispatch = useDispatch();
  const storeValues = useSelector((state: WidgetRootState) => state.widget?.values || {});

  // Get dataSourceRequestHandler from context if not provided as prop
  const { dataSourceRequestHandler: contextDataSourceRequestHandler, schemaData: contextSchemaData } = useWidgetContext();
  const dataSourceRequestHandler = propDataSourceRequestHandler || contextDataSourceRequestHandler;
  const currentSchemaData = schemaData || contextSchemaData || {};

  // IntakeForm mode: accordion state - which section is expanded (null = none; first expanded by default)
  const [expandedSectionIndex, setExpandedSectionIndex] = useState<number | null>(0);

  // RegistryView: track which section is currently in edit mode (by section-id); null = none
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  const handleEditModeChange = useCallback((sectionId: string, editing: boolean) => {
    setEditingSectionId(editing ? sectionId : null);
  }, []);
  const safeSections = sections ?? [];
  const prevSectionsLengthRef = useRef(safeSections.length);

  // Stable ref for namespace so formHandle useMemo doesn't depend on the (possibly inline) function identity
  const namespaceRef = useRef(namespace);
  namespaceRef.current = namespace;

  // Track dirty (unsaved changes) per section for form handle validation
  const sectionDirtyMapRef = useRef<Record<string, boolean>>({});
  const handleSectionDirtyChange = useCallback((sectionId: string, isDirty: boolean) => {
    sectionDirtyMapRef.current = { ...sectionDirtyMapRef.current, [sectionId]: isDirty };
    onSectionDirtyChange?.(sectionId, isDirty);
  }, [onSectionDirtyChange]);

  // Toggle: click expanded section to collapse; click collapsed section to expand
  const handleExpandSection = useCallback((index: number) => {
    setExpandedSectionIndex(prev => (prev === index ? null : index));
  }, []);

  // IntakeForm mode: called after section save - collapse current, expand next
  const handleSectionSaveSuccess = useCallback((index: number) => {
    if (index + 1 < safeSections.length) {
      setExpandedSectionIndex(index + 1);
    } else {
      setExpandedSectionIndex(null);
    }
  }, [safeSections.length]);

  // IntakeForm mode: called when Previous clicked - collapse current, expand previous
  const handlePreviousSection = useCallback((index: number) => {
    if (index > 0) {
      setExpandedSectionIndex(index - 1);
    }
  }, []);

  // Reset/init expanded section when sections change or first load (e.g. async form load)
  useEffect(() => {
    if (mode !== 'IntakeForm') return;
    const currentLength = safeSections.length;
    const prevLength = prevSectionsLengthRef.current;

    // Clamp when sections shrink or invalid index
    if (currentLength > 0 && expandedSectionIndex !== null && expandedSectionIndex >= currentLength) {
      setExpandedSectionIndex(0);
    }
    // When sections first load (0 -> N), ensure first section is expanded
    if (prevLength === 0 && currentLength > 0) {
      setExpandedSectionIndex(0);
    }

    prevSectionsLengthRef.current = currentLength;
  }, [mode, safeSections.length, expandedSectionIndex]);

  const UNSAVED_CHANGES_ERROR = 'Unsaved changes detected. Please save all sections before submitting.';

  // Form handle for onFormReady - allows host to validate and get all section data from its own Submit button
  const formHandle = useMemo<SectionsFormHandle>(() => {
    const getValues = () => (store.getState() as { widget?: { values?: Record<string, unknown> } }).widget?.values || {};
    const getNamespace = (section: SectionConfig, index: number) => {
      const ns = namespaceRef.current;
      return ns
        ? typeof ns === 'string'
          ? ns
          : ns(section['section-id'], index)
        : undefined;
    };

    const checkNoUnsavedChanges = () => {
      const hasDirty = Object.values(sectionDirtyMapRef.current).some(Boolean);
      if (hasDirty) {
        throw new Error(UNSAVED_CHANGES_ERROR);
      }
    };

    return {
      validate: async () => {
        checkNoUnsavedChanges();
        const values = getValues() as Record<string, unknown>;
        let allValid = true;
        for (let i = 0; i < safeSections.length; i++) {
          const section = safeSections[i];
          const ns = getNamespace(section, i);
          const rooted = applySectionDataRoot(section);
          const sectionToValidate = ns ? namespaceSectionConfig(rooted, ns) : rooted;
          const valid = sectionValidate(sectionToValidate, values, dispatch);
          if (!valid) allValid = false;
        }
        return allValid;
      },
      getFormData: () => getValues(),
      validateAndGetData: async () => {
        checkNoUnsavedChanges();
        const values = getValues() as Record<string, unknown>;
        const results: SectionChanges[] = [];
        for (let i = 0; i < safeSections.length; i++) {
          const section = safeSections[i];
          const ns = getNamespace(section, i);
          const rooted = applySectionDataRoot(section);
          const sectionToValidate = ns ? namespaceSectionConfig(rooted, ns) : rooted;
          const valid = sectionValidate(sectionToValidate, values, dispatch);
          if (!valid) {
            throw new Error('Validation failed');
          }
          results.push(buildSectionChanges(rooted, values, ns));
        }
        return results;
      },
      getStructuredData: () => {
        const values = getValues() as Record<string, unknown>;
        const results: SectionChanges[] = [];
        for (let i = 0; i < safeSections.length; i++) {
          const section = safeSections[i];
          const ns = getNamespace(section, i);
          const rooted = applySectionDataRoot(section);
          results.push(buildSectionChanges(rooted, values, ns));
        }
        return results;
      },
    };
  }, [store, dispatch, safeSections]);

  // Call onFormReady when form is ready (sections loaded)
  useEffect(() => {
    if (onFormReady && safeSections.length > 0) {
      onFormReady(formHandle);
    }
  }, [onFormReady, formHandle, safeSections.length]);

  // Warn if dataSourceRequestHandler is missing
  useEffect(() => {
    if (!dataSourceRequestHandler) {
      console.warn(
        '[SectionsContainer] ⚠️ dataSourceRequestHandler is not provided. ' +
        'Sections with widgets that have API data sources will not be able to load data. ' +
        'Please provide dataSourceRequestHandler prop to SectionsContainer or WidgetProvider.'
      );
    }
  }, [dataSourceRequestHandler]);
  // Find the maximum number of vertical panels across all sections
  // This determines the grid size (minimum 3 columns)
  // Also account for table widgets and their explicit column spans
  const maxVerticalPanels = Math.max(
    ...safeSections.map(section => {
      const panelCount = countVerticalPanels(section.panels);
      const tableWidgetSpan = getTableWidgetColumnSpan(section.panels);
      // Use explicit table widget span if specified, otherwise use default logic
      return tableWidgetSpan !== null
        ? Math.max(panelCount, tableWidgetSpan)
        : (hasTableWidget(section.panels) ? Math.max(panelCount, 2) : panelCount);
    }),
    3 // Minimum 3 columns
  );

  const containerId = 'sections-container-grid';

  return (
    <>
      <style>{`
        #${containerId} {
          display: grid;
          /* Flexible columns: minimum 200px, but can grow equally to fill width */
          grid-template-columns: repeat(${maxVerticalPanels}, minmax(200px, 1fr));
          gap: 1.5rem;
          width: 100%;
          align-items: start;
        }

        /* Sections with table widgets should expand to fill available space only if no explicit span */
        #${containerId} > .section[data-has-table="true"][data-has-explicit-span="false"] {
          grid-column: 1 / -1; /* Span all columns */
          width: 100%;
        }
        
        /* Sections with explicit table widget span - inline style will handle grid-column */
        /* This rule ensures width is 100% but doesn't override grid-column */
        #${containerId} > .section[data-has-explicit-span="true"] {
          width: 100%;
        }

        /* Responsive: on smaller screens, use auto-fit for flexibility */
        @media (max-width: 1023px) {
          #${containerId} {
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          }
        }

        /* IntakeForm mode: vertical accordion list instead of grid */
        #${containerId}.sections-container-intake-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          grid-template-columns: unset;
        }
        #${containerId}.sections-container-intake-form > .section {
          grid-column: unset;
          width: 100%;
        }
      `}</style>
      <div
        id={containerId}
        className={`sections-container ${className}${mode === 'IntakeForm' ? ' sections-container-intake-form' : ''}`}
      >
        {safeSections.map((section, index) => {
          // Determine namespace for this section
          const sectionNamespace = namespace
            ? (typeof namespace === 'string' ? namespace : namespace(section['section-id'], index))
            : undefined;

          const hideEditForSection =
            hideEditButton || section['section-hide-edit-button'] === true;

          // IntakeForm mode: pass accordion state and handlers
          const intakeFormProps = mode === 'IntakeForm'
            ? {
              sectionIndex: index,
              sectionCount: safeSections.length,
              expandedSectionIndex,
              onExpandSection: handleExpandSection,
              onSectionSaveSuccess: handleSectionSaveSuccess,
              onPreviousSection: handlePreviousSection,
              isDraft,
            }
            : {};

          // RegistryView: single-edit coordination props
          const registryViewEditProps = mode === 'RegistryView'
            ? {
              onEditModeChange: handleEditModeChange,
              forceExitEdit: editingSectionId !== null && editingSectionId !== section['section-id'],
            }
            : {};

          // Check if section has explicit column span
          if (section['section-column-span']) {
            return (
              <SectionRenderer
                key={section['section-id']}
                section={section}
                dataSourceRequestHandler={dataSourceRequestHandler}
                schemaData={schemaData}
                onValueChange={onValueChange}
                gridColumnSpan={section['section-column-span']}
                onSectionSave={onSectionSave}
                hideEditButton={hideEditForSection}
                mode={mode}
                namespace={sectionNamespace}
                onSectionDirtyChange={handleSectionDirtyChange}
                {...intakeFormProps}
                {...registryViewEditProps}
              />
            );
          }

          const verticalPanelsCount = countVerticalPanels(section.panels);
          const tableWidgetColumnSpan = getTableWidgetColumnSpan(section.panels);
          const containsTable = hasTableWidget(section.panels);
          const columnSpan = tableWidgetColumnSpan !== null
            ? tableWidgetColumnSpan
            : (containsTable ? Math.max(verticalPanelsCount, 2) : verticalPanelsCount);
          return (
            <SectionRenderer
              key={section['section-id']}
              section={section}
              dataSourceRequestHandler={dataSourceRequestHandler}
              schemaData={schemaData}
              onValueChange={onValueChange}
              gridColumnSpan={columnSpan}
              onSectionSave={onSectionSave}
              hideEditButton={hideEditForSection}
              mode={mode}
              namespace={sectionNamespace}
              onSectionDirtyChange={handleSectionDirtyChange}
              {...intakeFormProps}
              {...registryViewEditProps}
            />
          );
        })}
      </div>
    </>
  );
};
