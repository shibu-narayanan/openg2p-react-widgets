import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useDispatch, useSelector } from 'react-redux';
import { setValues } from '../store/widgetSlice';
import { WidgetRootState } from '../store';
import { SectionConfig, PanelConfig, SupportingDocumentConfig } from '../types';
import { UseBaseWidgetOptions } from '../hooks/useBaseWidget';
import { PanelRenderer } from './PanelRenderer';
import { useWidgetTranslation } from '../hooks/useWidgetTranslation';
import { useWidgetTheme } from '../hooks/useWidgetTheme';
import { themeToCSSVariables } from '../theme';
import { getValueByPath, setValueByPath, setWidgetValue } from '../utils/pathUtils';
import { useWidgetContext } from './WidgetProvider';
import { FileInputWidget } from '../widgets/FileInputWidget';
import { SectionMode } from './SectionsContainer';
import { applySectionDataRoot, namespaceSectionConfig } from '../utils/schemaNamespace';
import { sectionValidate, collectWidgets } from '../utils/sectionValidate';
import { extractTableRecordsFromSnapshot, isTableLikeWidget } from '../utils/extractTableRecordsFromSnapshot';
import { downArrowIcon, personIcon, calendarIcon, rightArrowIcon, arrowUpIcon, arrowDownIcon, arrowLeftIcon, arrowRightIcon } from '../assets';

/** Root class on readonly label/value rows; SectionRenderer scopes overflow/ellipsis rules here. */
const READONLY_VALUE_ROW_ROOT_CLASSES = [
  'TextDisplayWidget',
  'TextAreaDisplayWidget',
  'SelectDisplayWidget',
  'PhoneDisplayWidget',
  'NumberDisplayWidget',
  'CurrencyDisplayWidget',
  'RadioDisplayWidget',
  'DateDisplayWidget',
  'DateTimeDisplayWidget',
  'CheckboxDisplayWidget',
  'BooleanDisplayWidget',
  'FileDisplayWidget',
  'DisplayFieldWidget',
] as const;

/** Rows whose value is one line in .flex-1 > .text-gray-900 (ellipsis; full string via title on the element). */
const READONLY_SINGLE_LINE_VALUE_ROW_CLASSES = [
  'TextDisplayWidget',
  'SelectDisplayWidget',
  'PhoneDisplayWidget',
  'NumberDisplayWidget',
  'CurrencyDisplayWidget',
  'RadioDisplayWidget',
  'DateDisplayWidget',
  'DateTimeDisplayWidget',
  'CheckboxDisplayWidget',
  'BooleanDisplayWidget',
  'DisplayFieldWidget',
] as const;

function scopedClassSelectors(sectionClassId: string, classNames: readonly string[]): string {
  return classNames.map((c) => `.${sectionClassId} .${c}`).join(',\n        ');
}

// Track section changes for change request creation
export interface SectionChanges {
  section_id?: string;
  section_register_id?: string;
  records: unknown[];
  files?: unknown[];
  image?: File | null;
}

export interface SectionRendererProps {
  section: SectionConfig;
  dataSourceRequestHandler?: UseBaseWidgetOptions['dataSourceRequestHandler'];
  schemaData?: UseBaseWidgetOptions['schemaData'];
  onValueChange?: UseBaseWidgetOptions['onValueChange'];
  gridColumnSpan?: number; // Number of grid columns this section should span
  onSectionSave?: (changes: SectionChanges) => Promise<void> | void;
  hideEditButton?: boolean; // Hide the edit button band below the section
  mode?: SectionMode; // Display mode: 'RegistryView' (default), 'CRView', or 'IntakeForm'
  namespace?: string; // Optional namespace prefix for widget IDs (ensures uniqueness when same section is rendered multiple times)
  changeRequestType?: 'new' | 'old'; // For CRView mode: indicates if this is a new or old change request
  showChangeRequestLabel?: boolean; // Show "New" or "Old" label badge (default: true when changeRequestType is set)
  // CRView data is read from schemaData with keys: createdBy, createdDate, approvedBy, approvedDate

  dbSectionId?: string;
  sectionRegisterId?: string;

  /** Called when the section's dirty (has unsaved changes) status changes. Only fires while in edit mode. */
  onSectionDirtyChange?: (sectionId: string, isDirty: boolean) => void;

  /** IntakeForm mode: 0-based index of this section within the form */
  sectionIndex?: number;
  /** IntakeForm mode: total number of sections in the form */
  sectionCount?: number;
  /** IntakeForm mode: index of the currently expanded section (null = all collapsed) */
  expandedSectionIndex?: number | null;
  /** IntakeForm mode: called when user requests to expand a section (e.g. clicks accordion header) */
  onExpandSection?: (index: number) => void;
  /** IntakeForm mode: called when section save completes successfully (collapse current, expand next) */
  onSectionSaveSuccess?: (index: number) => void;
  /** IntakeForm mode: called when user clicks Previous (collapse current, expand previous) */
  onPreviousSection?: (index: number) => void;
  /** IntakeForm mode: when true or undefined, sections are editable; when false, sections are readonly */
  isDraft?: boolean;

  /** RegistryView: called when this section enters or exits edit mode. Used by SectionsContainer to enforce single-edit. */
  onEditModeChange?: (sectionId: string, editing: boolean) => void;
  /** RegistryView: when true, forces this section out of edit mode (another section took over). */
  forceExitEdit?: boolean;
}


/**
 * Renders a section with its panels
 * 
 * Layout behavior:
 * - Section width is based on max 3 panels (or more on high resolution)
 * - Panels wrap when they exceed available width
 * - Sections can sit side-by-side if there's space
 */
export const SectionRenderer = ({
  section,
  dataSourceRequestHandler: propDataSourceRequestHandler,
  schemaData,
  onValueChange,
  gridColumnSpan,
  onSectionSave,
  hideEditButton = false,
  mode = 'RegistryView',
  namespace,
  changeRequestType,
  showChangeRequestLabel = true,
  dbSectionId,
  sectionRegisterId,
  onSectionDirtyChange,
  sectionIndex,
  sectionCount,
  expandedSectionIndex,
  onExpandSection,
  onSectionSaveSuccess,
  onPreviousSection,
  isDraft,
  onEditModeChange,
  forceExitEdit,
}: SectionRendererProps) => {
  const { translateConfig, translate } = useWidgetTranslation();
  const resolvedTheme = useWidgetTheme();
  const portalCSSVariables = useMemo(() => themeToCSSVariables(resolvedTheme), [resolvedTheme]);
  const { schemaData: contextSchemaData, dataSourceRequestHandler: contextDataSourceRequestHandler } = useWidgetContext();
  const store = useStore();
  const dispatch = useDispatch();

  // Use prop handler if provided, otherwise fall back to context
  const dataSourceRequestHandler = propDataSourceRequestHandler || contextDataSourceRequestHandler;

  // Get CRView data from schemaData (prefer prop over context, then Redux store)
  const currentSchemaData = schemaData || contextSchemaData || {};
  const storeValues = useSelector((state: WidgetRootState) => state.widget?.values || {});

  // Namespace the section if namespace is provided
  // This ensures unique widget IDs when the same section is rendered multiple times
  const namespacedSection = useMemo(() => {
    const rooted = applySectionDataRoot(section);
    if (namespace) return namespaceSectionConfig(rooted, namespace);
    return rooted;
  }, [section, namespace]);

  // Create namespaced schemaData if namespace is provided.
  // Widgets with namespaced data-paths (e.g. "rv-section-0.a1a4d25a.birth_date")
  // need a nested object at values[namespace] so getValueByPath can traverse it.
  const namespacedSchemaData = useMemo(() => {
    if (!namespace || !currentSchemaData) {
      return schemaData;
    }
    return { ...currentSchemaData, [namespace]: currentSchemaData };
  }, [namespace, schemaData, currentSchemaData]);

  // Populate the store with namespaced schema data so that namespaced widgets
  // can read their initial values via getValueByPath on the namespaced paths.
  useEffect(() => {
    if (namespace && namespacedSchemaData) {
      dispatch(setValues(namespacedSchemaData));
    }
  }, [namespace, namespacedSchemaData, dispatch]);

  const crViewData = useMemo(() => {
    if (mode !== 'CRView') return null;
    // Try to get from schemaData first, then from Redux store
    // Merge both sources to ensure we get the data
    const dataSource = { ...storeValues, ...currentSchemaData };
    const recordPath = Object.keys(dataSource)[0];

    const result = {
      createdBy: getValueByPath(dataSource, `${recordPath}.created_by`),
      createdDate: getValueByPath(dataSource, `${recordPath}.created_at`),
      approvedBy: getValueByPath(dataSource, `${recordPath}.last_approved_by`),
      approvedDate: getValueByPath(dataSource, `${recordPath}.last_approved_at`),
    };
    return result;
  }, [mode, currentSchemaData, storeValues]);

  // Original (non-namespaced) section ID — used for edit mode coordination with SectionsContainer
  const originalSectionId = section['section-id'];

  // Use namespaced section for rendering
  const sectionToRender = namespacedSection;
  const sectionId = sectionToRender['section-id'];
  const gridId = `section-panels-${sectionId}`;
  const sectionClassId = `section-${sectionId}`;

  const readonlyValueRowRootsCss = useMemo(
    () => scopedClassSelectors(sectionClassId, READONLY_VALUE_ROW_ROOT_CLASSES),
    [sectionClassId]
  );
  const readonlyValueRowFlex1Css = useMemo(
    () =>
      READONLY_VALUE_ROW_ROOT_CLASSES.map((c) => `.${sectionClassId} .${c} > .flex-1`).join(',\n        '),
    [sectionClassId]
  );
  const readonlySingleLineValueTextCss = useMemo(
    () =>
      READONLY_SINGLE_LINE_VALUE_ROW_CLASSES.map(
        (c) => `.${sectionClassId} .${c} > .flex-1 > .text-gray-900`
      ).join(',\n        '),
    [sectionClassId]
  );

  // IntakeForm mode: accordion expand/collapse state (supports toggle)
  const [standaloneExpanded, setStandaloneExpanded] = useState(true); // For sectionIndex undefined (standalone use)
  const isExpandedFromContainer = typeof sectionIndex === 'number' && expandedSectionIndex === sectionIndex;
  const isExpandedStandalone = sectionIndex === undefined && standaloneExpanded;
  const isExpanded = mode === 'IntakeForm' && (isExpandedFromContainer || isExpandedStandalone);

  const handleAccordionToggle = useCallback(() => {
    if (mode !== 'IntakeForm') return;
    if (typeof sectionIndex === 'number' && onExpandSection) {
      onExpandSection(sectionIndex);
    } else if (sectionIndex === undefined) {
      setStandaloneExpanded(prev => !prev);
    }
  }, [mode, sectionIndex, onExpandSection]);

  // Recursively count all vertical panels, especially those nested inside horizontal panels
  // Typically: horizontal panels at first level contain vertical panels at second level
  // Accounts for panel-column-span: a panel with column-span 3 counts as 3 columns
  const countVerticalPanels = (panels: SectionConfig['panels']): number => {
    let count = 0;
    for (const panel of panels) {
      const orientation = panel['panel-orientation'] || 'vertical';

      if (orientation === 'horizontal' && panel.panels) {
        // For horizontal panels, count all vertical panels nested inside (typically second level)
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

  // Check if section contains a table widget
  const checkForTableWidget = (panels: PanelConfig[]): boolean => {
    for (const panel of panels) {
      if (panel.widgets) {
        for (const widget of panel.widgets) {
          if (widget.widget === 'table' || widget['widget-type'] === 'table') {
            return true;
          }
        }
      }
      if (panel.panels) {
        if (checkForTableWidget(panel.panels)) {
          return true;
        }
      }
    }
    return false;
  };

  // Get table widget column span if explicitly set
  const getTableWidgetColumnSpan = (panels: PanelConfig[]): number | null => {
    for (const panel of panels) {
      if (panel.widgets) {
        for (const widget of panel.widgets) {
          if (widget.widget === 'table' || widget['widget-type'] === 'table') {
            // Return the widget's column span if specified, otherwise null
            return widget['widget-column-span'] || null;
          }
        }
      }
      if (panel.panels) {
        const nestedSpan = getTableWidgetColumnSpan(panel.panels);
        if (nestedSpan !== null) {
          return nestedSpan;
        }
      }
    }
    return null;
  };

  const hasTableWidget = checkForTableWidget(sectionToRender.panels);
  const tableWidgetColumnSpan = getTableWidgetColumnSpan(sectionToRender.panels);

  const verticalPanelsCount = countVerticalPanels(sectionToRender.panels);
  // If section contains a table widget with explicit column span, use it
  // Otherwise, if it has a table widget, ensure it spans at least 2 columns
  // Otherwise, use the vertical panel count
  const columnSpan = gridColumnSpan ||
    (tableWidgetColumnSpan !== null ? tableWidgetColumnSpan :
      (hasTableWidget ? Math.max(verticalPanelsCount, 2) : verticalPanelsCount));

  // Check if table widget has explicit column span (not default)
  const hasExplicitTableSpan = tableWidgetColumnSpan !== null;

  // Supporting documents configuration
  const supportingDocuments = sectionToRender['section-supporting-documents'] || [];
  const hasSupportingDocuments = supportingDocuments.length > 0;

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);

  // RegistryView: force exit edit mode when another section takes over
  useEffect(() => {
    if (forceExitEdit && isEditMode) {
      setIsEditMode(false);
    }
  }, [forceExitEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isDocumentsExpanded, setIsDocumentsExpanded] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [sectionHeight, setSectionHeight] = useState<number | null>(null);
  const [editSectionPosition, setEditSectionPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Capture section position when entering edit mode and update on scroll
  useEffect(() => {
    if (isEditMode && sectionRef.current) {
      const updatePosition = () => {
        if (sectionRef.current) {
          const rect = sectionRef.current.getBoundingClientRect();
          setEditSectionPosition({
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width,
          });
        }
      };

      // Initial position calculation
      requestAnimationFrame(updatePosition);

      // Update position on scroll to keep it aligned with original section
      window.addEventListener('scroll', updatePosition, { passive: true });
      window.addEventListener('resize', updatePosition, { passive: true });

      return () => {
        window.removeEventListener('scroll', updatePosition);
        window.removeEventListener('resize', updatePosition);
      };
    } else if (!isEditMode) {
      setEditSectionPosition(null);
      setSectionHeight(null);
    }
  }, [isEditMode]);

  // Recursively modify panels to set readonly based on edit mode
  const makePanelsEditable = (panels: PanelConfig[], editable: boolean): PanelConfig[] => {
    const sectionEditable = sectionToRender['section-editable'] === true;
    return panels.map(panel => {
      const modifiedPanel: PanelConfig = {
        ...panel,
        panels: panel.panels ? makePanelsEditable(panel.panels, editable) : undefined,
        widgets: panel.widgets?.map(widget => {
          // When NOT in edit mode (editable = false), set all widgets to readonly
          // When in edit mode (editable = true):
          //   - If section-editable is true, force widgets to be editable (override widget-readonly)
          //   - Otherwise, respect original readonly setting
          const newReadonly = editable
            ? (sectionEditable ? false : (widget['widget-readonly'] || false))
            : true;

          return {
            ...widget,
            'widget-readonly': newReadonly,
          };
        }),
      };
      return modifiedPanel;
    });
  };

  // Create section with widgets readonly/editable based on edit mode
  // IntakeForm: editable when isDraft is true or undefined; readonly when isDraft is false. Edit Details never shown.
  // RegistryView/CRView: use isEditMode (edit overlay flow)
  const widgetsEditable = mode === 'IntakeForm' ? (isDraft !== false) : isEditMode;
  const editableSection = useMemo(() => {
    return {
      ...sectionToRender,
      panels: makePanelsEditable(sectionToRender.panels, widgetsEditable),
    };
  }, [sectionToRender, widgetsEditable]);


  // Handle edit button click
  const handleEdit = () => {
    // Capture height BEFORE entering edit mode to preserve space
    if (sectionRef.current) {
      const height = sectionRef.current.offsetHeight;
      setSectionHeight(height);
    }
    setIsEditMode(true);
    onEditModeChange?.(originalSectionId, true);
  };

  // Render the edit section (absolutely positioned duplicate via portal)
  // IntakeForm never uses this overlay - content is shown inline in accordion
  const renderEditSection = () => {
    if (mode === 'IntakeForm' || !isEditMode || !editSectionPosition) return null;

    const editGridId = `${gridId}-edit`;

    return createPortal(
      <>
        <style>{`
          #${editGridId} {
            display: flex;
            flex-wrap: wrap;
            width: 100%;
          }
          #${editGridId} > .panel-wrapper {
            flex: 1 1 100%;
            min-width: 0;
          }
          @media (min-width: 640px) {
            #${editGridId} > .panel-wrapper {
              flex: 1 1 calc(50% - 0.75rem);
            }
          }
          @media (min-width: 1024px) {
            #${editGridId} > .panel-wrapper {
              flex: 1 1 calc(33.333% - 1rem);
            }
          }
          @media (min-width: 1280px) {
            #${editGridId} > .panel-wrapper {
              flex: 1 1 calc(25% - 1.125rem);
            }
          }
          @media (min-width: 1536px) {
            #${editGridId} > .panel-wrapper {
              flex: 1 1 calc(20% - 1.2rem);
            }
          }
          
          /* Vertical dividers between vertical panels in edit mode */
          #${editGridId} > .panel-wrapper {
            position: relative;
          }
          /* Only add divider between panels, not after the last one */
          #${editGridId} > .panel-wrapper:not(.last-panel-wrapper)::after {
            content: '';
            position: absolute;
            right: 0;
            top: 0;
            bottom: 5px;
            width: 1px;
            background-color: var(--owt-color-primary, #F5BB1A);
          }
        `}</style>
        <div
          className={`section ${sectionClassId} ${sectionClassId}-edit px-4 sm:px-6 lg:px-8`}
          data-section-id={`${sectionId}-edit`}
          style={{
            ...portalCSSVariables,
            position: 'absolute',
            top: `${editSectionPosition.top}px`,
            left: `${editSectionPosition.left}px`,
            width: `${editSectionPosition.width}px`,
            maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          {sectionToRender['section-title'] && (
            <h2 className="text-xl font-semibold mb-4" style={{ fontFamily: 'Roboto, sans-serif', marginTop: '35px' }}>{translateConfig(sectionToRender['section-title'])}</h2>
          )}
          <div id={editGridId} className="section-panels">
            {editableSection.panels.map((panel, index) => {
              const isLastPanel = index === editableSection.panels.length - 1;
              return (
                <div
                  key={panel['panel-id'] || `section-panel-${index}`}
                  className={`panel-wrapper ${isLastPanel ? 'last-panel-wrapper' : ''}`}
                >
                  <PanelRenderer
                    panel={panel}
                    dataSourceRequestHandler={dataSourceRequestHandler}
                    schemaData={namespacedSchemaData}
                    onValueChange={onValueChange}
                    isEditMode={true}
                  />
                </div>
              );
            })}
            <hr className="w-full" style={{ height: '1px', backgroundColor: 'var(--owt-section-divider-color, #F5BB1A)', border: 'none', margin: '25px 0 0 0' }} />
            {hasSupportingDocuments && (
              <>
                <div className="supporting-documents-container">
                  <button
                    type="button"
                    onClick={() => setIsDocumentsExpanded(!isDocumentsExpanded)}
                    className="supporting-documents-title-button w-full flex items-center text-left"
                  >
                    <span className="font-semibold" style={{ fontFamily: 'Roboto, sans-serif', fontSize: '16px' }}>
                      {translate('common.supportedDocuments') || 'Supported Documents'}
                    </span>
                    <img
                      src={isDocumentsExpanded ? arrowUpIcon : arrowDownIcon}
                      alt="Toggle Documents"
                      className="w-4 h-2.25 transition-transform ml-2"
                    />
                  </button>
                  {isDocumentsExpanded && (
                    <div className="supporting-documents-grid mt-4">
                      {supportingDocuments.map((doc, index) => {
                        const docConfig = createDocumentWidgetConfig(doc, sectionId, index);
                        return (
                          <div key={`${sectionId}-doc-${index}`} className="supporting-document-item">
                            <FileInputWidget config={docConfig} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
            <hr className="w-full" style={{ height: '1px', backgroundColor: 'var(--owt-section-divider-color, #F5BB1A)', border: 'none', marginTop: hasSupportingDocuments ? '20px' : 0, marginBottom: '20px' }} />
            <div className="edit-controls-container" style={{ marginBottom: '20px' }}>
              <div className="edit-controls-buttons">
                <button
                  onClick={handleCancel}
                  className="text-sm font-medium px-6 py-2 transition-colors"
                  style={{
                    fontFamily: 'Roboto, sans-serif',
                    borderRadius: 'var(--owt-btn-border-radius, 10px)',
                    border: '1px solid var(--owt-btn-secondary-border, #C4C4C4)',
                    backgroundColor: 'var(--owt-btn-secondary-bg, #FFFFFF)',
                    color: 'var(--owt-btn-secondary-color, #011627)',
                  }}
                >
                  {translate('common.cancel') || 'Cancel'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!isDirty}
                  className="text-sm font-medium px-6 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    fontFamily: 'Roboto, sans-serif',
                    borderRadius: 'var(--owt-btn-border-radius, 10px)',
                    border: '1px solid var(--owt-btn-primary-border, #F07B1A)',
                    backgroundColor: 'var(--owt-color-primary, #F5BB1A)',
                    color: 'var(--owt-color-bg, #FFFFFF)',
                  }}
                >
                  {translate('common.save') || 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>,
      document.body
    );
  };


  const trackSectionChages = (widgets: any[], sourceData: any, pathPrefix?: string) => {
    if (!widgets || widgets.length === 0) return [];

    const snapshot: Record<string, any> = {};
    let hasTable = false;

    const resolvePath = (path: string) => (pathPrefix ? `${pathPrefix}.${path}` : path);

    widgets.forEach(widget => {
      const widgetPath = widget['widget-data-path'];
      if (!widgetPath) return;

      if (isTableLikeWidget(widget)) {
        hasTable = true;
      }

      if (typeof widgetPath === 'object') {
        Object.values(widgetPath).forEach((path: unknown) => {
          if (typeof path === 'string' && path.length > 0) {
            snapshot[path] = getValueByPath(sourceData, resolvePath(path));
          }
        });
      } else if (typeof widgetPath === 'string') {
        snapshot[widgetPath] = getValueByPath(sourceData, resolvePath(widgetPath));
      }
    });

    if (!hasTable) {
      const cleanedSnapshot: Record<string, any> = {};

      Object.entries(snapshot).forEach(([fullPath, value]) => {
        const fieldPath = fullPath.includes('.')
          ? fullPath.split('.').slice(1).join('.')
          : fullPath;

        cleanedSnapshot[fieldPath] = value;
      });

      const sectionData = sectionRegisterId
        ? (pathPrefix
            ? getValueByPath(sourceData, resolvePath(sectionRegisterId))
            : sourceData[sectionRegisterId])
        : {};

      return [
        {
          ...sectionData,
          ...cleanedSnapshot,
          edit_action: "UPDATE",
        },
      ];
    }

    return extractTableRecordsFromSnapshot(snapshot as Record<string, unknown>, widgets);
  };


  // Get original section (without namespace) for building snapshots
  // This ensures we use the original data paths when saving
  const originalSection = section;

  /** Build a full section snapshot (records + files) for dirty comparison. Works with or without sectionRegisterId (e.g. IntakeForm). */
  const buildSectionSnapshot = useCallback((
    sourceData: Record<string, any>,
    pathPrefix?: string
  ): { records: unknown[]; files: unknown[] } => {
    const sectionWidgets = collectWidgets(originalSection.panels);
    const resolvePath = (path: string) => (pathPrefix ? `${pathPrefix}.${path}` : path);

    let records: unknown[];
    const recordsFromTrack = trackSectionChages(sectionWidgets, sourceData, pathPrefix);

    if (recordsFromTrack.length > 0) {
      records = recordsFromTrack;
    } else {
      // IntakeForm / no sectionRegisterId: build comparable snapshot from widget values
      const snapshot: Record<string, any> = {};
      sectionWidgets.forEach((widget) => {
        const widgetPath = widget['widget-data-path'];
        if (!widgetPath) return;
        if (typeof widgetPath === 'object') {
          Object.values(widgetPath).forEach((path: unknown) => {
            if (typeof path === 'string' && path.length > 0) {
              snapshot[path] = getValueByPath(sourceData, resolvePath(path));
            }
          });
        } else if (typeof widgetPath === 'string') {
          snapshot[widgetPath] = getValueByPath(sourceData, resolvePath(widgetPath));
        }
      });
      records = [{ ...snapshot }];
    }

    const files: unknown[] = [];
    if (hasSupportingDocuments) {
      const originalSupportingDocuments = originalSection['section-supporting-documents'] || [];
      originalSupportingDocuments.forEach((doc) => {
        const originalDataPath = doc['document-data-path'];
        const storeDataPath = pathPrefix && originalDataPath
          ? `${pathPrefix}.${originalDataPath}`
          : originalDataPath;
        files.push(getValueByPath(sourceData, storeDataPath));
      });
    }

    return { records, files };
  }, [originalSection, hasSupportingDocuments]);

  // Capture baseline when entering edit mode (used for isDirty comparison)
  const baselineSnapshotRef = useRef<{ records: unknown[]; files: unknown[] } | null>(null);
  // IntakeForm only: increment when baseline is updated after save - forces badge to update (refs don't trigger re-renders)
  const [intakeFormBaselineTrigger, setIntakeFormBaselineTrigger] = useState(0);
  // IntakeForm only: tracks whether the user has actually saved this section (prevents "Saved" badge on initial load)
  const [hasBeenSavedByUser, setHasBeenSavedByUser] = useState(false);

  // IntakeForm: treat as edit mode for dirty tracking when isDraft. RegistryView: use isEditMode.
  const effectiveEditModeForDirty = mode === 'IntakeForm' ? (isDraft !== false) : isEditMode;

  // Compute isDirty: compare current store state to baseline (only when in edit mode)
  const isDirty = useMemo(() => {
    if (!effectiveEditModeForDirty) return false;
    const baseline = baselineSnapshotRef.current;
    if (!baseline) return false;

    const currentSnapshot = buildSectionSnapshot(storeValues, namespace);

    return JSON.stringify(baseline) !== JSON.stringify(currentSnapshot);
  }, [effectiveEditModeForDirty, storeValues, namespace, buildSectionSnapshot, intakeFormBaselineTrigger]);

  // Set baseline when entering edit mode; clear when leaving (baseline captured only on entry)
  useEffect(() => {
    if (effectiveEditModeForDirty) {
      const oldSchemaData = schemaData || contextSchemaData || {};
      if (namespace) {
        const namespacedSchema = getValueByPath(oldSchemaData, namespace);
        baselineSnapshotRef.current = namespacedSchema
          ? buildSectionSnapshot(namespacedSchema as Record<string, any>)
          : buildSectionSnapshot(oldSchemaData);
      } else {
        baselineSnapshotRef.current = buildSectionSnapshot(oldSchemaData);
      }
    } else {
      baselineSnapshotRef.current = null;
      onSectionDirtyChange?.(sectionId, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline must be captured only when effectiveEditModeForDirty toggles
  }, [effectiveEditModeForDirty]);

  // Notify parent when isDirty changes (only while in edit mode)
  useEffect(() => {
    if (effectiveEditModeForDirty && onSectionDirtyChange) {
      onSectionDirtyChange(sectionId, isDirty);
    }
  }, [effectiveEditModeForDirty, isDirty, sectionId, onSectionDirtyChange]);

  // IntakeForm only: section status badge (Saved / Modified and not saved / no badge when pristine)
  const intakeFormSectionStatus = useMemo<'saved' | 'modified' | null>(() => {
    if (mode !== 'IntakeForm' || isDraft === false) return null;
    if (isDirty) return 'modified';
    if (hasBeenSavedByUser) return 'saved';
    return null;
  }, [mode, isDirty, hasBeenSavedByUser]);

  // Revert store values to the original schemaData for this section's widgets.
  // Used by both handleSave (RegistryView raises a CR, so values should not persist)
  // and handleCancel.
  const revertToOriginalValues = useCallback(() => {
    const sectionWidgets = collectWidgets(originalSection.panels);
    const oldSchemaData = schemaData || contextSchemaData;
    const currentStoreValues = (store.getState() as any).widget.values;
    let newStoreValues = currentStoreValues;

    sectionWidgets.forEach(widget => {
      const originalWidgetId = widget['widget-id'];
      const namespacedWidgetId = namespace ? `${namespace}__${originalWidgetId}` : originalWidgetId;
      const widgetId = namespacedWidgetId;
      const originalDataPath = widget['widget-data-path'];
      const storeDataPath = namespace && originalDataPath
        ? (typeof originalDataPath === 'string'
          ? `${namespace}.${originalDataPath}`
          : Object.fromEntries(
            Object.entries(originalDataPath).map(([key, path]) => [key, `${namespace}.${path}`])
          ))
        : originalDataPath;

      if (widgetId && originalDataPath) {
        let oldValue: any;
        if (typeof originalDataPath === 'object') {
          oldValue = {};
          Object.entries(originalDataPath).forEach(([key, path]) => {
            if (typeof path === 'string') {
              oldValue[key] = getValueByPath(oldSchemaData, path);
            }
          });
        } else if (typeof originalDataPath === 'string') {
          oldValue = getValueByPath(oldSchemaData, originalDataPath);
        }

        if (oldValue !== undefined) {
          newStoreValues = setWidgetValue(
            newStoreValues,
            storeDataPath,
            widgetId,
            oldValue
          );
          // Also revert the widgetId-based entry — useBaseWidget.handleChange
          // sets values[widgetId] during editing, and useBaseWidget.currentValue
          // reads values[widgetId] first before falling through to the dataPath.
          newStoreValues = { ...newStoreValues, [widgetId]: oldValue };
        }
      }
    });

    if (hasSupportingDocuments) {
      const originalSupportingDocuments = originalSection['section-supporting-documents'] || [];
      originalSupportingDocuments.forEach((doc, index) => {
        const widgetId = `supporting-doc-${sectionId}-${index}`;
        const originalDataPath = doc['document-data-path'];
        const storeDataPath = namespace && originalDataPath
          ? `${namespace}.${originalDataPath}`
          : originalDataPath;
        const oldValue = getValueByPath(oldSchemaData, originalDataPath);
        newStoreValues = setWidgetValue(
          newStoreValues,
          storeDataPath,
          widgetId,
          oldValue
        );
      });
    }

    if (newStoreValues !== currentStoreValues) {
      dispatch(setValues(newStoreValues));
    }
  }, [originalSection, schemaData, contextSchemaData, store, namespace, hasSupportingDocuments, sectionId, dispatch]);

  // Handle save button click
  const handleSave = async () => {
    if (!store || !onSectionSave) {
      console.warn('Missing store or onSectionSave in SectionRenderer');
      setIsEditMode(false);
      onEditModeChange?.(originalSectionId, false);
      return;
    }
    // Use original section (without namespace) for collecting widgets
    // This ensures we use the original widget IDs and data paths
    const sectionWidgets = collectWidgets(originalSection.panels)
    const currentState = (store.getState() as any).widget
    const currentSchemaData = currentState.values || {}

    const isSectionValid = sectionValidate(
      originalSection,
      currentSchemaData,
      dispatch,
    );
    if (!isSectionValid) {
      return;
    }

    // schema data before section change
    const oldSchemaData = schemaData || contextSchemaData
    // schema data after section change (use namespace when store has namespaced paths)
    const newSchemaData = trackSectionChages(
      sectionWidgets,
      currentSchemaData,
      namespace
    )

    // Include supporting documents in the snapshot if they exist
    const sectionFiles: unknown[] = [];
    if (hasSupportingDocuments) {
      // Use original section's supporting documents to get original data paths
      const originalSupportingDocuments = originalSection['section-supporting-documents'] || [];
      originalSupportingDocuments.forEach((doc) => {
        const originalDataPath = doc['document-data-path'];
        // Read new value from store (with namespace if used)
        const storeDataPath = namespace && originalDataPath
          ? `${namespace}.${originalDataPath}`
          : originalDataPath;
        sectionFiles.push(getValueByPath(currentSchemaData, storeDataPath));
      });
    }

    if (JSON.stringify(oldSchemaData) !== JSON.stringify(newSchemaData)) {
      let profileImage: File | null = null;
      for (const record of newSchemaData) {
        if (typeof record === 'object' && record !== null) {
          for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
            if (value instanceof File) {
              profileImage = value;
              (record as Record<string, unknown>)[key] = '';
            }
          }
        }
      }

      try {
        const sectionchanges: SectionChanges = {
          section_id: dbSectionId ?? originalSection['section-id'],
          section_register_id: sectionRegisterId,
          records: [...newSchemaData],
          files: [...sectionFiles],
          ...(profileImage ? { image: profileImage } : {}),
        }
        await onSectionSave(sectionchanges)
      } catch (error) {
        console.error('Section Changes Save failed', error)
      }
    }

    // In RegistryView, save raises a CR — the actual data update follows a
    // separate approval workflow, so revert the displayed values to the
    // originals so the view doesn't show unapproved edits.
    if (mode === 'RegistryView') {
      revertToOriginalValues();
    }

    setIsEditMode(false);
    onEditModeChange?.(originalSectionId, false);

  };

  // IntakeForm: save section then collapse current and expand next (or stay on final section)
  const handleIntakeFormSave = useCallback(async () => {
    if (sectionIndex === undefined) return;

    // Only run save/validation logic when in draft mode and handlers are available
    if (isDraft !== false && store && onSectionSave) {
      const sectionWidgets = collectWidgets(originalSection.panels);
      const currentState = (store.getState() as any).widget;
      const currentSchemaData = currentState.values || {};

      const isSectionValid = sectionValidate(originalSection, currentSchemaData, dispatch);
      if (!isSectionValid) return;

      const oldSchemaData = schemaData || contextSchemaData;
      const newSchemaData = trackSectionChages(sectionWidgets, currentSchemaData, namespace);

      const sectionFiles: unknown[] = [];
      if (hasSupportingDocuments) {
        const originalSupportingDocuments = originalSection['section-supporting-documents'] || [];
        originalSupportingDocuments.forEach((doc) => {
          const originalDataPath = doc['document-data-path'];
          const storeDataPath = namespace && originalDataPath
            ? `${namespace}.${originalDataPath}`
            : originalDataPath;
          sectionFiles.push(getValueByPath(currentSchemaData, storeDataPath));
        });
      }

      if (JSON.stringify(oldSchemaData) !== JSON.stringify(newSchemaData)) {
        let profileImage: File | null = null;
        for (const record of newSchemaData) {
          if (typeof record === 'object' && record !== null) {
            for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
              if (value instanceof File) {
                profileImage = value;
                (record as Record<string, unknown>)[key] = '';
              }
            }
          }
        }

        try {
          await onSectionSave({
            section_id: dbSectionId ?? originalSection['section-id'],
            section_register_id: sectionRegisterId,
            records: [...newSchemaData],
            files: [...sectionFiles],
            ...(profileImage ? { image: profileImage } : {}),
          });
        } catch (error) {
          console.error('Section Changes Save failed', error);
          return;
        }
      }

      if (mode === 'IntakeForm') {
        baselineSnapshotRef.current = buildSectionSnapshot(currentSchemaData, namespace);
        setIntakeFormBaselineTrigger((prev) => prev + 1);
        setHasBeenSavedByUser(true);
      }
      onSectionDirtyChange?.(sectionId, false);
    }

    // Always navigate to the next section
    onSectionSaveSuccess?.(sectionIndex);
  }, [store, onSectionSave, onSectionSaveSuccess, sectionIndex, originalSection, schemaData, contextSchemaData, namespace, hasSupportingDocuments, dbSectionId, sectionRegisterId, dispatch, buildSectionSnapshot, sectionId, onSectionDirtyChange, mode, isDraft]);

  // Handle cancel button click
  const handleCancel = () => {
    revertToOriginalValues();
    setIsEditMode(false);
    onEditModeChange?.(originalSectionId, false);
  };

  // Create widget config for supporting document
  const createDocumentWidgetConfig = (
    doc: SupportingDocumentConfig,
    sectionId: string,
    index: number
  ) => {
    const documentType = doc['document-type'] || 'file';
    const accept = doc['document-accept'] ||
      (documentType === 'image' ? 'image/*' :
        documentType === 'pdf' ? '.pdf' :
          '*/*');

    // Use the namespaced section ID for widget ID to ensure uniqueness
    const widgetId = `supporting-doc-${sectionId}-${index}`;

    return {
      widget: 'file',
      'widget-type': 'input' as const,
      'widget-label': doc['document-label'] || doc['document-data-path'] || `Document ${index + 1}`,
      'widget-id': widgetId,
      'widget-data-path': doc['document-data-path'],
      'widget-required': doc['document-required'] || false,
      'widget-readonly': mode === 'IntakeForm' && isDraft === false,
      'widget-data-options': {
        accept,
        multiple: false,
        maxSize: doc['document-max-size'],
      },
    };
  };

  return (
    <>
      {renderEditSection()}
      <style>{`
        .${sectionClassId} {
          /* Section spans grid columns based on vertical panel count */
          /* This ensures all sections align to the same grid boundaries */
          width: 100%;
          position: relative;
          transition: box-shadow 0.3s ease-in-out, border-color 0.3s ease-in-out;
          min-height: auto !important;
          height: auto !important;
        }
        .${sectionClassId} label.text-gray-700,
        .${sectionClassId} .text-gray-600 {
          font-weight: 400 !important;
          color: var(--owt-color-text-muted, #727474) !important;
          width: 50% !important;
          min-width: 50% !important;
          max-width: 50% !important;
          flex-shrink: 0 !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        /* Readonly: prevent flex row from overflowing panel */
        ${readonlyValueRowRootsCss} {
          min-width: 0 !important;
          overflow: hidden !important;
        }
        ${readonlyValueRowFlex1Css} {
          min-width: 0 !important;
          overflow: hidden !important;
        }
        /* Readonly value: single-line ellipsis; full value via title on the value node */
        ${readonlySingleLineValueTextCss} {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* Readonly textarea: break unbroken long tokens; title on pre keeps full text on hover */
        .${sectionClassId} .TextAreaDisplayWidget > .flex-1 > pre {
          min-width: 0;
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        
        /* Only apply fixed height when in edit mode */
        .${sectionClassId}[data-edit-mode="true"] {
          min-height: auto;
        }
        
        /* Hide original section content when in edit mode but maintain space */
        .${sectionClassId}[data-edit-mode="true"] {
          visibility: hidden;
          position: relative;
        }
        
        /* Ensure all children are also hidden but maintain their space */
        .${sectionClassId}[data-edit-mode="true"] * {
          visibility: hidden;
        }
        
        /* Edit section styles (rendered via portal, absolutely positioned) */
        .${sectionClassId}-edit {
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 
                      0 8px 10px -6px rgba(0, 0, 0, 0.1);
          border-color: var(--owt-color-primary-dark, #F07B1A);
          border-style: dashed;
          border-width: 1px;
          background-color: var(--owt-color-primary-light, #FBE6AA);
          border-radius: var(--owt-section-border-radius, 10px);
          z-index: 10;
          position: absolute;
        }
        
        /* Ensure widget containers in edit section have no margin bottom */
        .${sectionClassId}-edit .widget-container {
          margin-bottom: 0 !important;
        }
        
        
        /* Only set grid-column in CSS if no explicit span (inline style will handle explicit spans) */
        .${sectionClassId}[data-has-explicit-span="false"] {
          grid-column: span ${columnSpan};
        }
        
        #${gridId} {
          display: flex;
          flex-wrap: wrap;
          // gap: 1.5rem;
          width: 100%;
          ${hasTableWidget ? 'margin-bottom: 20px;' : ''}
        }
        #${gridId} > .panel-wrapper {
          flex: 1 1 100%;
          min-width: 0;
          position: relative;
        }
        /* Mobile: 1 panel per row */
        @media (min-width: 640px) {
          #${gridId} > .panel-wrapper {
            flex: 1 1 calc(50% - 0.75rem);
          }
        }
        /* Tablet/Desktop: 3 panels per row (max) */
        @media (min-width: 1024px) {
          #${gridId} > .panel-wrapper {
            flex: 1 1 calc(33.333% - 1rem);
          }
        }
        /* Large screens: 4 panels per row */
        @media (min-width: 1280px) {
          #${gridId} > .panel-wrapper {
            flex: 1 1 calc(25% - 1.125rem);
          }
        }
        /* XL screens: 5 panels per row */
        @media (min-width: 1536px) {
          #${gridId} > .panel-wrapper {
            flex: 1 1 calc(20% - 1.2rem);
          }
        }
        
        
        /* Supporting documents container */
        .${sectionClassId} .supporting-documents-container {
          width: 100%;
        }
        
        .${sectionClassId} .supporting-documents-title-button {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        
        .${sectionClassId} .supporting-documents-title-button:hover {
          opacity: 0.8;
        }
        
        .${sectionClassId} .supporting-documents-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .${sectionClassId} .supporting-document-item {
          width: 100%;
        }
        
        .${sectionClassId} .supporting-document-item > div {
          margin-bottom: 0 !important;
        }
        
        .${sectionClassId} .edit-controls-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
        }
        
        .${sectionClassId} .edit-controls-buttons {
          display: flex;
          justify-content: flex-start;
          align-items: center;
          gap: 0.5rem;
        }

        

        

        /* IntakeForm accordion */
        .${sectionClassId}.intake-form-accordion-item {
          border-color: var(--owt-color-border-light, #E4E4E4);
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .${sectionClassId}.intake-form-accordion-item:hover {
          border-color: var(--owt-color-border, #C4C4C4);
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-accordion-header {
          transition: opacity 0.2s ease, background-color 0.2s ease;
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-accordion-header h2 {
          color: var(--owt-color-primary-dark, #F07B1A);
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-accordion-header:hover {
          opacity: 0.85;
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-accordion-header:focus-visible {
          outline: 2px solid var(--owt-color-primary, #F5BB1A);
          outline-offset: 2px;
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-accordion-content {
          padding-top: 8px;
          padding-bottom: 0px;
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-edit-controls {
          justify-content: flex-end;
          width: 100%;
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-prev-btn {
          color: var(--owt-color-text-muted, #727474) !important;
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-prev-btn:disabled {
          color: var(--owt-color-border, #C4C4C4) !important;
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-prev-btn:hover:not(:disabled) {
          background-color: var(--owt-color-bg-alt, #F6F6F6);
          border-color: var(--owt-btn-primary-border, #F07B1A);
        }
        .${sectionClassId}.intake-form-accordion-item .intake-form-save-btn:hover:not(:disabled) {
          background-color: var(--owt-color-border-light, #E4E4E4);
        }
      `}</style>
      <div
        ref={sectionRef}
        className={`section ${sectionClassId} px-4 sm:px-6 lg:px-8 border-2 ${mode === 'IntakeForm' ? 'intake-form-accordion-item' : ''}`}
        data-section-id={sectionId}
        data-has-table={hasTableWidget ? 'true' : 'false'}
        data-has-explicit-span={hasExplicitTableSpan ? 'true' : 'false'}
        data-edit-mode={isEditMode ? 'true' : 'false'}
        data-section-dirty={isEditMode && isDirty ? 'true' : 'false'}
        data-column-span={columnSpan}
        data-change-request-type={changeRequestType}
        data-intake-form-expanded={mode === 'IntakeForm' ? (isExpanded ? 'true' : 'false') : undefined}
        style={{
          gridColumn: `span ${columnSpan}`,
          width: '100%',
          borderRadius: 'var(--owt-section-border-radius, 10px)',
          borderColor: 'var(--owt-color-bg, #FFFFFF)',
          ...(mode === 'IntakeForm' && isExpanded
            ? { backgroundColor: 'var(--owt-color-primary-light, #FBE6AA)', border: '1px dashed var(--owt-color-primary-dark, #F07B1A)' }
            : {
                backgroundColor: changeRequestType === 'old' ? 'var(--owt-color-bg-alt, #F6F6F6)' : 'var(--owt-section-bg, #FFFFFF)',
                opacity: changeRequestType === 'old' ? 0.95 : 1,
              }),
          ...(isEditMode && sectionHeight ? {
            height: `${sectionHeight}px`,
            minHeight: `${sectionHeight}px`
          } : {
            // Ensure no min-height when not in edit mode
            minHeight: 'auto',
            height: 'auto'
          }),
        }}
      >
        {mode === 'IntakeForm' ? (
          /* IntakeForm: accordion layout - header always visible, content only when expanded */
          <>
            <button
              type="button"
              id={`intake-form-accordion-header-${sectionId}`}
              className="intake-form-accordion-header"
              onClick={handleAccordionToggle}
              aria-expanded={isExpanded}
              aria-controls={isExpanded ? `intake-form-accordion-content-${sectionId}` : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: '16px 0',
                marginTop: '16px',
                marginBottom: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'Roboto, sans-serif',
              }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <h2 className="text-xl font-semibold" style={{ margin: 0 }}>
                  {sectionToRender['section-title']
                    ? translateConfig(sectionToRender['section-title'])
                    : `Section ${(sectionIndex ?? 0) + 1}`}
                </h2>
                {/* IntakeForm only: Saved/Modified badges */}
                {intakeFormSectionStatus === 'saved' && (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: 'var(--owt-color-success-light, #D1FAE5)',
                      color: 'var(--owt-color-success-dark, #047857)',
                    }}
                  >
                    {translate('common.sectionSaved') || 'Saved'}
                  </span>
                )}
                {intakeFormSectionStatus === 'modified' && (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: 'var(--owt-color-error-light, #FEE2E2)',
                      color: 'var(--owt-color-error, #B91C1C)',
                    }}
                  >
                    {translate('common.sectionModified') || 'Modified and not saved'}
                  </span>
                )}
              </div>
              <img
                src={isExpanded ? arrowUpIcon : arrowDownIcon}
                alt={isExpanded ? 'Collapse' : 'Expand'}
                className="w-5 h-5 transition-transform"
                style={{ flexShrink: 0, marginLeft: '12px' }}
                aria-hidden
              />
            </button>
            {isExpanded && (
              <div
                id={`intake-form-accordion-content-${sectionId}`}
                className="intake-form-accordion-content"
                role="region"
                aria-labelledby={`intake-form-accordion-header-${sectionId}`}
              >
                <div
                  id={gridId}
                  className="section-panels"
                  style={{ paddingTop: '8px' }}
                >
                  {editableSection.panels.map((panel, index) => (
                    <div
                      key={panel['panel-id'] || `section-panel-${index}`}
                      className="panel-wrapper"
                    >
                      <PanelRenderer
                        panel={panel}
                        dataSourceRequestHandler={dataSourceRequestHandler}
                        schemaData={namespacedSchemaData}
                        onValueChange={onValueChange}
                        isEditMode={isDraft !== false}
                      />
                    </div>
                  ))}
                  <hr className="w-full" style={{ height: '1px', backgroundColor: 'var(--owt-section-divider-color, #F5BB1A)', border: 'none', margin: '15px 0 0 0' }} />
                  {hasSupportingDocuments && (
                    <div className="supporting-documents-container">
                      <span className="font-semibold" style={{ fontFamily: 'Roboto, sans-serif', fontSize: '16px' }}>
                        {translate('common.supportedDocuments') || 'Supported Documents'}
                      </span>
                      <div className="supporting-documents-grid mt-4">
                        {supportingDocuments.map((doc, docIndex) => {
                          const docConfig = createDocumentWidgetConfig(doc, sectionId, docIndex);
                          return (
                            <div key={`${sectionId}-doc-${docIndex}`} className="supporting-document-item">
                              <FileInputWidget config={docConfig} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div
                    className="intake-form-edit-controls"
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '12px',
                      marginTop: '10px',
                      marginBottom: '10px',
                      width: '100%',
                    }}
                  >
                    {typeof sectionIndex === 'number' && sectionIndex > 0 && (
                      <button
                        type="button"
                        onClick={() => onPreviousSection?.(sectionIndex)}
                        className="intake-form-prev-btn"
                        style={{
                          fontFamily: 'Roboto, sans-serif',
                          fontSize: '14px',
                          fontWeight: 400,
                          padding: '8px 24px',
                          borderRadius: 'var(--owt-btn-border-radius, 10px)',
                          border: '1px solid var(--owt-btn-primary-border, #F07B1A)',
                          background: 'var(--owt-btn-primary-bg, #FFFFFF)',
                          color: 'var(--owt-color-text-muted, #727474)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <img
                          src={arrowLeftIcon}
                          alt=""
                          aria-hidden
                          style={{ width: '14px', height: '14px', opacity: 0.5 }}
                        />
                        {translate('common.previous') || 'Prev'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleIntakeFormSave}
                      className="intake-form-save-btn"
                      style={{
                        fontFamily: 'Roboto, sans-serif',
                        fontSize: '14px',
                        fontWeight: 400,
                        padding: '8px 24px',
                        borderRadius: 'var(--owt-btn-border-radius, 10px)',
                        border: '1px solid var(--owt-btn-primary-border, #F07B1A)',
                        background: 'var(--owt-btn-primary-bg, #FFFFFF)',
                        color: 'var(--owt-color-text-muted, #727474)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {translate('common.next') || 'Next'}
                      <img
                        src={arrowRightIcon}
                        alt=""
                        aria-hidden
                        style={{ width: '14px', height: '14px' }}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* RegistryView / CRView: standard layout */
          <>
            {/* Section Title with Change Request Label */}
            {sectionToRender['section-title'] && (
              <div style={{
                marginTop: '35px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}>
                <h2 className="text-xl font-semibold" style={{ margin: 0 }}>
                  {translateConfig(sectionToRender['section-title'])}
                </h2>
                {/* Change Request Label Badge */}
                {mode === 'CRView' && changeRequestType && showChangeRequestLabel && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      backgroundColor: changeRequestType === 'new' ? 'var(--owt-color-success, #16A34A)' : 'var(--owt-color-error-light, #FEE2E2)',
                      color: changeRequestType === 'new' ? 'var(--owt-color-bg, #FFFFFF)' : 'var(--owt-color-error, #B91C1C)',
                      whiteSpace: 'nowrap',
                      boxShadow: changeRequestType === 'new' ? '0 2px 4px rgba(40, 167, 69, 0.3)' : 'none',
                    }}
                  >
                    {changeRequestType === 'new' ? 'New' : 'Old'}
                  </span>
                )}
              </div>
            )}
            <div
              id={gridId}
              className="section-panels"
              style={mode === 'RegistryView' && hideEditButton ? { paddingBottom: '30px' } : {}}
            >
          {editableSection.panels.map((panel, index) => (
            <div
              key={panel['panel-id'] || `section-panel-${index}`}
              className="panel-wrapper"
            >
              <PanelRenderer
                panel={panel}
                dataSourceRequestHandler={dataSourceRequestHandler}
                schemaData={namespacedSchemaData}
                onValueChange={onValueChange}
              />
            </div>
          ))}
          {/* CRView Mode - Show Created by / Approved by information */}
          {mode === 'CRView' && crViewData && (
            <>
              <hr className="w-full" style={{ height: '1px', marginTop: '20px', marginBottom: '0px', border: 'none', backgroundColor: 'var(--owt-color-border, #C4C4C4)' }} />
              <div className="cr-view-container" style={{
                marginTop: '20px',
                paddingBottom: '30px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
              }}>
                {/* Created by section - Left aligned */}
                <div className="created-by-section" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flex: 1,
                }}>
                  <span style={{
                    fontFamily: 'Roboto, sans-serif',
                    fontSize: '14px',
                    color: 'var(--owt-color-text, #011627)',
                    fontWeight: 'normal',
                  }}>
                    Created by
                  </span>
                  {/* Person icon */}
                  <img src={personIcon} alt="Person" width="16" height="16" style={{ filter: 'brightness(0) saturate(100%) invert(56%) sepia(45%) saturate(5139%) hue-rotate(348deg) brightness(96%) contrast(92%)' }} />
                  {crViewData?.createdBy && (
                    <span style={{
                      fontFamily: 'Roboto, sans-serif',
                      fontSize: '14px',
                      color: 'var(--owt-color-text, #011627)',
                      fontWeight: 'normal',
                    }}>
                      {crViewData.createdBy}
                    </span>
                  )}
                  {/* Calendar icon */}
                  <img src={calendarIcon} alt="Calendar" width="16" height="16" style={{ marginLeft: '6px' }} />
                  {crViewData?.createdDate && (
                    <span style={{
                      fontFamily: 'Roboto, sans-serif',
                      fontSize: '14px',
                      color: 'var(--owt-color-text, #011627)',
                      fontWeight: 'normal',
                    }}>
                      {crViewData.createdDate}
                    </span>
                  )}
                </div>

                {/* Approved by section - Right aligned */}
                <div className="approved-by-section" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flex: 1,
                  justifyContent: 'flex-end',
                }}>
                  <span style={{
                    fontFamily: 'Roboto, sans-serif',
                    fontSize: '14px',
                    color: 'var(--owt-color-text, #011627)',
                    fontWeight: 'normal',
                  }}>
                    Approved by
                  </span>
                  {/* Person icon */}
                  <img src={personIcon} alt="Person" width="16" height="16" style={{ filter: 'brightness(0) saturate(100%) invert(56%) sepia(45%) saturate(5139%) hue-rotate(348deg) brightness(96%) contrast(92%)' }} />
                  {crViewData?.approvedBy && (
                    <span style={{
                      fontFamily: 'Roboto, sans-serif',
                      fontSize: '14px',
                      color: 'var(--owt-color-text, #011627)',
                      fontWeight: 'normal',
                    }}>
                      {crViewData.approvedBy}
                    </span>
                  )}
                  {/* Calendar icon */}
                  <img src={calendarIcon} alt="Calendar" width="16" height="16" style={{ marginLeft: '6px' }} />
                  {crViewData?.approvedDate && (
                    <span style={{
                      fontFamily: 'Roboto, sans-serif',
                      fontSize: '14px',
                      color: 'var(--owt-color-text, #011627)',
                      fontWeight: 'normal',
                    }}>
                      {crViewData.approvedDate}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
          {/* RegistryView Mode - Show edit button (if not hidden) */}
          {mode === 'RegistryView' && !hideEditButton && (
            <hr className="w-full" style={{ height: '1px', marginTop: !isEditMode ? '10px' : 0, marginBottom: '14px', border: 'none', backgroundColor: 'var(--owt-color-border, #C4C4C4)' }} />
          )}
          {mode === 'RegistryView' && !isEditMode && !hideEditButton && (
            <div className="flex justify-center items-center" style={{ marginBottom: '20px' }}>
              <button
                onClick={handleEdit}
                className="font-normal inline-flex items-center gap-2 bg-transparent border-0 p-0 cursor-pointer hover:opacity-80"
                style={{
                  fontFamily: 'Roboto, sans-serif',
                  fontSize: '16px',
                  color: 'var(--owt-color-text-muted, #727474)',
                }}
              >
                {translate('common.editDetails') || 'Edit Details'}
                <img src={rightArrowIcon} alt="right-arrow" className="w-3.5 h-3.5 brightness-0 opacity-50" />
              </button>
            </div>
          )}
            </div>
          </>
        )}
      </div>
    </>
  );
};
