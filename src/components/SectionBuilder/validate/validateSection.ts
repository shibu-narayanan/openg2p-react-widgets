import type { BaseWidgetConfig, PanelConfig, SectionConfig } from '../../../types';
import { ORIENTATIONS, WIDGET_TYPES } from '../schemas';

export interface SectionValidationResult {
  isValid: boolean;
  errors: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateSection(section: SectionConfig): SectionValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(section['section-id'])) {
    errors.push('section-id is required');
  }

  const panelIds = new Set<string>();
  const widgetIds = new Set<string>();

  const validateWidget = (widget: BaseWidgetConfig, path: string) => {
    if (!isNonEmptyString(widget['widget-id'])) {
      errors.push(`${path}: widget-id is required`);
    } else if (widgetIds.has(widget['widget-id'])) {
      errors.push(`${path}: duplicate widget-id "${widget['widget-id']}"`);
    } else {
      widgetIds.add(widget['widget-id']);
    }

    if (!isNonEmptyString(widget.widget)) {
      errors.push(`${path}: widget type is required`);
    } else if (!(WIDGET_TYPES as readonly string[]).includes(widget.widget)) {
      errors.push(`${path}: unknown widget type "${widget.widget}"`);
    }

    // Common footgun: input widgets without data path.
    if (widget['widget-type'] === 'input') {
      const dp: any = (widget as any)['widget-data-path'];
      if (!(isNonEmptyString(dp) || (dp && typeof dp === 'object'))) {
        errors.push(`${path}: widget-data-path is required for input widgets`);
      }
    }
  };

  const validatePanel = (panel: PanelConfig, path: string) => {
    if (!isNonEmptyString(panel['panel-id'])) {
      errors.push(`${path}: panel-id is required`);
    } else if (panelIds.has(panel['panel-id'])) {
      errors.push(`${path}: duplicate panel-id "${panel['panel-id']}"`);
    } else {
      panelIds.add(panel['panel-id']);
    }

    const orientation = panel['panel-orientation'];
    if (orientation && !(ORIENTATIONS as readonly string[]).includes(orientation)) {
      errors.push(`${path}: invalid panel-orientation "${orientation}"`);
    }

    if (panel.widgets) {
      panel.widgets.forEach((w, idx) => validateWidget(w, `${path}.widgets[${idx}]`));
    }
    if (panel.panels) {
      panel.panels.forEach((p, idx) => validatePanel(p, `${path}.panels[${idx}]`));
    }
  };

  if (!Array.isArray(section.panels)) {
    errors.push('panels must be an array');
  } else if (section.panels.length === 0) {
    errors.push('section must have at least one panel');
  } else {
    section.panels.forEach((p, idx) => validatePanel(p, `panels[${idx}]`));
  }

  return { isValid: errors.length === 0, errors };
}

