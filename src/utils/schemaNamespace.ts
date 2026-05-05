import { SectionConfig, PanelConfig, BaseWidgetConfig } from '../types';

/**
 * Prefix a data path with the section data root (if provided).
 * Leaves already-prefixed paths untouched.
 */
const applyDataRootToDataPath = (
  dataPath: string | Record<string, string> | undefined,
  dataRoot: string,
): string | Record<string, string> | undefined => {
  if (!dataPath) return dataPath;

  const prefix = `${dataRoot}.`;

  if (typeof dataPath === 'string') {
    if (!dataPath) return dataPath;
    if (dataPath === dataRoot) return dataPath;
    if (dataPath.startsWith(prefix)) return dataPath;
    return `${dataRoot}.${dataPath}`;
  }

  const rooted: Record<string, string> = {};
  for (const [key, path] of Object.entries(dataPath)) {
    if (!path) {
      rooted[key] = path;
      continue;
    }
    if (path === dataRoot || path.startsWith(prefix)) {
      rooted[key] = path;
      continue;
    }
    rooted[key] = `${dataRoot}.${path}`;
  }
  return rooted;
};

/**
 * Namespace a data path by adding a namespace prefix
 */
const namespaceDataPath = (
  dataPath: string | Record<string, string> | undefined,
  namespace: string
): string | Record<string, string> | undefined => {
  if (!dataPath) return dataPath;
  
  if (typeof dataPath === 'string') {
    // Add namespace prefix to the data path
    return `${namespace}.${dataPath}`;
  }
  
  // Multi-path: namespace each path
  const namespaced: Record<string, string> = {};
  for (const [key, path] of Object.entries(dataPath)) {
    namespaced[key] = `${namespace}.${path}`;
  }
  return namespaced;
};

/**
 * Recursively namespace widget IDs and data paths in a widget configuration
 * This ensures unique widget IDs and data paths when the same section is rendered multiple times
 */
const namespaceWidgetConfig = (
  widgetConfig: BaseWidgetConfig,
  namespace: string
): BaseWidgetConfig => {
  const namespaced: BaseWidgetConfig = { ...widgetConfig };

  // Namespace the widget-id
  if (namespaced['widget-id']) {
    namespaced['widget-id'] = `${namespace}__${namespaced['widget-id']}`;
  }

  // Namespace the widget-data-path to ensure values are stored separately
  if (namespaced['widget-data-path']) {
    namespaced['widget-data-path'] = namespaceDataPath(
      namespaced['widget-data-path'],
      namespace
    );
  }

  // Recursively namespace nested widgets (for layout widgets)
  if (namespaced.widgets && Array.isArray(namespaced.widgets)) {
    namespaced.widgets = namespaced.widgets.map((widget) =>
      namespaceWidgetConfig(widget, namespace)
    );
  }

  // Namespace widget-item (for array/group widgets)
  if (namespaced['widget-item']) {
    namespaced['widget-item'] = namespaceWidgetConfig(
      namespaced['widget-item'],
      namespace
    );
  }

  // Namespace widget-data-columns (for table widgets)
  if (namespaced['widget-data-columns'] && Array.isArray(namespaced['widget-data-columns'])) {
    namespaced['widget-data-columns'] = namespaced['widget-data-columns'].map((column) => {
      const namespacedColumn = { ...column };
      // Namespace column data paths if they exist (columns only support string paths, not multi-path)
      if (namespacedColumn['widget-data-path'] && typeof namespacedColumn['widget-data-path'] === 'string') {
        namespacedColumn['widget-data-path'] = namespaceDataPath(
          namespacedColumn['widget-data-path'],
          namespace
        ) as string; // Safe cast since we checked it's a string
      }
      return namespacedColumn;
    });
  }

  return namespaced;
};

/**
 * Apply section-data-root to all widget data paths in a section (recursive).
 * This enables using relative widget-data-path values like "fname" instead of "<id>.fname".
 */
export const applySectionDataRoot = (section: SectionConfig): SectionConfig => {
  const dataRoot = section['section-data-root'];
  if (!dataRoot) return section;

  const applyToWidget = (w: BaseWidgetConfig): BaseWidgetConfig => {
    const next: BaseWidgetConfig = { ...w };

    if (next['widget-data-path']) {
      next['widget-data-path'] = applyDataRootToDataPath(next['widget-data-path'], dataRoot) as any;
    }

    if (next.widgets && Array.isArray(next.widgets)) {
      next.widgets = next.widgets.map(applyToWidget);
    }

    if (next['widget-item']) {
      next['widget-item'] = applyToWidget(next['widget-item']);
    }

    if (next['widget-data-columns'] && Array.isArray(next['widget-data-columns'])) {
      next['widget-data-columns'] = next['widget-data-columns'].map((col) => {
        const c = { ...col };
        if (c['widget-data-path'] && typeof c['widget-data-path'] === 'string') {
          c['widget-data-path'] = applyDataRootToDataPath(c['widget-data-path'], dataRoot) as string;
        }
        return c;
      });
    }

    return next;
  };

  const applyToPanel = (p: PanelConfig): PanelConfig => {
    const next: PanelConfig = { ...p };
    if (next.panels && Array.isArray(next.panels)) next.panels = next.panels.map(applyToPanel);
    if (next.widgets && Array.isArray(next.widgets)) next.widgets = next.widgets.map(applyToWidget);
    return next;
  };

  const nextSection: SectionConfig = { ...section };
  if (nextSection.panels && Array.isArray(nextSection.panels)) {
    nextSection.panels = nextSection.panels.map(applyToPanel);
  }
  if (nextSection['section-supporting-documents'] && Array.isArray(nextSection['section-supporting-documents'])) {
    nextSection['section-supporting-documents'] = nextSection['section-supporting-documents'].map((doc) => ({
      ...doc,
      'document-data-path': applyDataRootToDataPath(doc['document-data-path'], dataRoot) as string,
    }));
  }
  return nextSection;
};

/**
 * Recursively namespace widget IDs in a panel configuration
 */
const namespacePanelConfig = (
  panel: PanelConfig,
  namespace: string
): PanelConfig => {
  const namespaced: PanelConfig = { ...panel };

  // Recursively namespace nested panels
  if (namespaced.panels && Array.isArray(namespaced.panels)) {
    namespaced.panels = namespaced.panels.map((p) =>
      namespacePanelConfig(p, namespace)
    );
  }

  // Namespace widgets in panel
  if (namespaced.widgets && Array.isArray(namespaced.widgets)) {
    namespaced.widgets = namespaced.widgets.map((widget) =>
      namespaceWidgetConfig(widget, namespace)
    );
  }

  return namespaced;
};

/**
 * Namespace widget IDs and data paths in a section configuration
 * This ensures unique widget IDs and data paths when the same section is rendered multiple times
 * (e.g., in CRView mode showing old and new records side by side)
 * 
 * @param section - Section configuration to namespace
 * @param namespace - Namespace prefix to add to widget IDs and data paths (e.g., "old", "new", "instance-1")
 * @returns Namespaced section configuration
 */
export const namespaceSectionConfig = (
  section: SectionConfig,
  namespace: string
): SectionConfig => {
  const rooted = applySectionDataRoot(section);
  const namespaced: SectionConfig = { ...rooted };

  // Namespace the section-id as well to ensure uniqueness
  if (namespaced['section-id']) {
    namespaced['section-id'] = `${namespace}__${namespaced['section-id']}`;
  }

  // Recursively namespace panels
  if (namespaced.panels && Array.isArray(namespaced.panels)) {
    namespaced.panels = namespaced.panels.map((panel) =>
      namespacePanelConfig(panel, namespace)
    );
  }

  // Namespace supporting documents data paths
  if (namespaced['section-supporting-documents'] && Array.isArray(namespaced['section-supporting-documents'])) {
    namespaced['section-supporting-documents'] = namespaced['section-supporting-documents'].map((doc) => ({
      ...doc,
      'document-data-path': doc['document-data-path'] 
        ? `${namespace}.${doc['document-data-path']}`
        : doc['document-data-path'],
    }));
  }

  return namespaced;
};
