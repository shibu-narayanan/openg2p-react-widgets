import { z } from 'zod';

/**
 * Widget data path can be a string (single path) or object (multi-path)
 */
export type WidgetDataPath = string | Record<string, string>;

/**
 * Data source types
 */
export type DataSourceType = 'static' | 'api' | 'schema';

/**
 * Static data source configuration
 */
export interface StaticDataSource {
  type: 'static';
  options: Array<{ value: string | number; label: string }>;
}

/**
 * Data source request handler - called by widgets to request data from host application
 * Host application handles all API calls, formatting, CORS, auth, etc.
 */
export type DataSourceRequestHandler = (
  service: string,              // Service mnemonic (e.g., "master-data", "geo-service")
  endpoint: string,             // Endpoint/operation name (e.g., "get_g2p_geo_level_values", "get_g2p_programs")
  method: string,               // HTTP method ("GET", "POST", etc.)
  params: Record<string, any>,   // Request parameters (level_id, parent_level_value_id, etc.)
  options?: {
    headers?: Record<string, string>;
  }
) => Promise<any>;               // Returns response data (host handles all formatting)

/**
 * API data source configuration
 */
export interface ApiDataSource {
  type: 'api';
  service: string;               // Service mnemonic (e.g., "master-data") - host app handles routing
  endpoint: string;              // Endpoint/operation name (e.g., "get_g2p_geo_level_values") - identifies which endpoint within the service
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  dependsOn?: string; // Field path or widget-id this depends on
  valueKey?: string; // Key for value in response
  labelKey?: string; // Key for label in response
  params?: Record<string, any>; // Static parameters to include in request (merged with dependency params)
  [key: string]: any; // Allow additional fields like level_id for backward compatibility
  // Deprecated: url - use service + endpoint instead
  url?: string; // @deprecated - use service + endpoint instead
}

/**
 * Schema reference data source configuration
 */
export interface SchemaDataSource {
  type: 'schema';
  path: string; // Path to reference data in schema
  valueKey?: string;
  labelKey?: string;
}

export type DataSource = StaticDataSource | ApiDataSource | SchemaDataSource;

/**
 * Allowed character types for text input
 */
export type CharacterType =
  | 'any'           // Any text (default)
  | 'alphabetic'     // Alphabetic only (a-z, A-Z)
  | 'alphanumeric'   // Alphanumeric (a-z, A-Z, 0-9)
  | 'numeric'        // Numeric only (0-9)
  | 'numeric-decimal' // Numeric with decimals (0-9, .)
  | 'custom';        // Custom character set

/**
 * Case control options
 */
export type CaseControl =
  | 'none'           // No restriction (default)
  | 'lowercase'      // Force lowercase
  | 'uppercase'      // Force uppercase
  | 'capitalize';    // Capitalize words / first letter

/**
 * Input mask configuration
 */
export interface InputMask {
  pattern: string;   // Mask pattern (e.g., "XXX-XXX-XXXX" or "phone" for dynamic)
  type?: 'static' | 'phone' | 'national-id' | 'custom'; // Dynamic mask types
  placeholder?: string; // Placeholder character for mask (default: '_')
}

/**
 * Validation type options for common patterns
 */
export type ValidationType =
  | 'email'      // Email address validation
  | 'phone'      // Phone number validation
  | 'url';       // URL validation
// Additional types can be added here in the future

/**
 * Validation configuration
 */
export interface WidgetValidation {
  required?: boolean;
  validationType?: ValidationType; // Predefined validation type (email, phone, url, etc.)
  pattern?: string; // Custom regex pattern (takes precedence over validationType if both are provided)
  patternMessage?: string; // Custom message for pattern validation mismatch
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  custom?: string; // Custom validation function name
  zodSchema?: z.ZodSchema; // Zod schema for validation
}

/**
 * Numeric type options
 */
export type NumericType =
  | 'integer'      // Integer only
  | 'decimal';     // Decimal number

/**
 * Rounding mode for decimal numbers
 */
export type RoundingMode =
  | 'round'        // Round to nearest (default)
  | 'truncate';    // Truncate (floor for positive, ceil for negative)

/**
 * Text alignment options
 */
export type TextAlign =
  | 'left'         // Left-aligned
  | 'right';       // Right-aligned (default for numbers)

/**
 * Boolean representation options
 */
export type BooleanRepresentation =
  | 'true-false'   // true / false
  | 'yes-no'       // yes / no
  | 'on-off'       // on / off
  | 'custom';      // Custom labels

/**
 * Boolean control type options
 */
export type BooleanControlType =
  | 'checkbox'     // Single checkbox
  | 'radio'        // Two radio buttons
  | 'toggle';      // Toggle / switch

/**
 * Format configuration
 */
export interface WidgetFormat {
  dateFormat?: string;
  currency?: string;
  locale?: string;
  decimals?: number;
  pattern?: string; // For phone, etc.
  inputType?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'file'; // HTML input type for text widgets
  // Text input specific format options
  characterType?: CharacterType; // Allowed character type
  customCharset?: string; // Custom character set regex pattern (for characterType: 'custom')
  caseControl?: CaseControl; // Case transformation
  mask?: InputMask; // Input masking configuration
  showCharCounter?: boolean; // Show live character counter
  rows?: number; // Number of rows for textarea (default: 2)
  // Number input specific format options
  numericType?: NumericType; // Integer or decimal (default: 'decimal')
  decimalPlaces?: number; // Number of decimal places (0-6, default: 0 for integer, 2 for decimal)
  roundingMode?: RoundingMode; // Rounding or truncation mode (default: 'round')
  thousandSeparator?: string; // Thousand separator character (default: ',' or locale-based)
  decimalSeparator?: string; // Decimal separator character (default: '.' or locale-based)
  textAlign?: TextAlign; // Text alignment (default: 'right' for numbers)
  allowSigned?: boolean; // Allow negative numbers (default: true)
  formatOnBlur?: boolean; // Apply formatting on blur (default: true)
  // Boolean input specific format options
  booleanRepresentation?: BooleanRepresentation; // How to represent boolean values (default: 'true-false')
  booleanControlType?: BooleanControlType; // Control type (default: 'checkbox')
  booleanTrueLabel?: string; // Custom label for true value
  booleanFalseLabel?: string; // Custom label for false value
  allowUnset?: boolean; // Allow unset/null value (default: false, unless widget-required is false)
  // Radio input specific format options
  layout?: 'vertical' | 'horizontal' | 'grid'; // Layout type (default: 'vertical')
  sortOptions?: boolean; // Sort options alphabetically by label (default: false)
  // Date input specific format options
  inputMethod?: 'picker' | 'manual' | 'hybrid'; // Input method (default: 'picker' for date, 'picker' for datetime)
  dateConstraint?: 'any' | 'past-only' | 'future-only'; // Date constraint type (default: 'any')
  // DateTime input specific format options
  dateTimeFormat?: string; // DateTime format string (default: 'YYYY-MM-DDTHH:mm')
  dateTimeConstraint?: 'any' | 'past-only' | 'future-only'; // DateTime constraint type (default: 'any')
}

/**
 * Condition operators
 */
export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'notEmpty'
  | 'empty'
  | 'greaterThan'
  | 'lessThan'
  | 'contains'
  | 'notContains';

/**
 * Condition configuration
 */
export interface WidgetCondition {
  field: string; // Field path to check
  operator: ConditionOperator;
  value?: any; // Value to compare (for equals, notEquals, etc.)
}

/**
 * Widget options for conditional behavior
 */
export interface WidgetOptions {
  action?: 'show' | 'hide' | 'enable' | 'disable';
  condition?: WidgetCondition;
  minDate?: string;
  maxDate?: string;
  showCalendar?: boolean;
  [key: string]: any; // Allow widget-specific options
}

/**
 * Widget cascade configuration
 */
export interface WidgetCascadeConfig {
  listenTo: string[]; // Array of parent widget IDs to listen to
  onEvent?: 'widget:change' | 'widget:blur' | 'widget:focus' | 'widget:reload' | 'widget:clear';
  clearOnChange?: boolean; // Clear child value when parent changes (default: true)
  reloadOnChange?: boolean; // Reload data source when parent changes (default: true)
  debounce?: number; // Debounce time in milliseconds
  throttle?: number; // Throttle time in milliseconds
}

/**
 * Widget geo configuration
 */
export interface WidgetGeoConfig {
  level: string; // Geo level identifier (e.g., "admin1", "admin2")
  isLastLevel: boolean; // Whether this is the final level in the hierarchy
  parentWidgetId: string | null; // ID of parent geo widget (null for first level)
  levelMnemonic?: string; // Optional level mnemonic override
}

/**
 * Base widget configuration
 */
export interface BaseWidgetConfig {
  widget: string; // Widget name/type
  'widget-type'?: 'input' | 'layout' | 'table' | 'group'; // Optional - can be inferred from widget name
  'widget-label'?: string;
  'widget-id': string;
  'widget-orientation'?: 'horizontal' | 'vertical'; // For layout widgets that support orientation
  'widget-data-path'?: WidgetDataPath;
  'widget-data-default'?: any;
  'widget-required'?: boolean;
  'widget-readonly'?: boolean;
  'widget-data-validation'?: WidgetValidation;
  'widget-data-format'?: WidgetFormat;
  'widget-data-source'?: DataSource;
  'widget-data-options'?: WidgetOptions;
  'widget-data-placeholder'?: string;
  'widget-data-helptext'?: string;
  'widget-data-tooltip'?: string;
  'widget-cascade'?: WidgetCascadeConfig; // Cascade configuration
  'widget-geo-config'?: WidgetGeoConfig; // Geo cascade configuration
  widgets?: BaseWidgetConfig[]; // For layout widgets
  'widget-item'?: BaseWidgetConfig; // For array/group widgets
  'widget-data-columns'?: Array<{
    'column-key': string;
    'widget-label': string;
    widget?: string; // Widget type for column
    'widget-type'?: string;
    'widget-data-path'?: string;
    'widget-data-default'?: any;
    'widget-data-format'?: WidgetFormat;
    'widget-data-validation'?: WidgetValidation;
    'widget-data-source'?: DataSource;
    'widget-data-placeholder'?: string;
    'widget-required'?: boolean;
    'widget-readonly'?: boolean;
    [key: string]: any; // Allow additional widget-specific properties
  }>;
  'widget-data-operations'?: {
    add?: boolean;
    remove?: boolean;
    edit?: boolean;
  };
  'widget-data-add-label'?: string;
  'widget-data-collapsed'?: boolean;
  'widget-column-span'?: number; // Number of columns to span (1, 2, 3, etc.) - for table widgets and layout control
  _comment?: string; // For schema comments/documentation
  [key: string]: any; // Allow additional widget-specific properties
}

/**
 * Panel configuration - a layout container that can contain nested panels or widgets
 */
export interface PanelConfig {
  'panel-id': string;
  'panel-orientation'?: 'horizontal' | 'vertical'; // optional, defaults to "vertical"
  'panel-column-span'?: number; // Number of columns to span (1, 2, 3, etc.) - for layout control
  // Styling fields removed - only panel-orientation remains
  panels?: PanelConfig[]; // Nested panels
  widgets?: BaseWidgetConfig[]; // Widgets within this panel
}

/**
 * Supporting document configuration
 */
export interface SupportingDocumentConfig {
  'document-data-path': string;
  'document-type'?: string; // e.g., "image", "pdf", etc.
  'document-required'?: boolean;
  'document-label'?: string; // Optional label for the document
  'document-accept'?: string; // File accept types (e.g., ".pdf,.doc,.docx")
  'document-max-size'?: number; // Maximum file size in bytes
}

/**
 * Section configuration
 */
export interface SectionConfig {
  'section-id': string;
  'section-title'?: string; // Optional - can be empty for card-based layouts
  'section-editable'?: boolean;
  /** When true in RegistryView, hides the "Edit Details" link for this section only. */
  'section-hide-edit-button'?: boolean;
  /**
   * Optional data root prefix for all widget data paths in this section.
   * Example: if section-data-root = "<registryId>" and widget-data-path = "fname",
   * the resolved path becomes "<registryId>.fname".
   */
  'section-data-root'?: string;
  'section-column-span'?: number; // Number of columns to span (1, 2, 3, etc.) - for layout control
  'section-supporting-documents'?: SupportingDocumentConfig[];
  panels: PanelConfig[];
}

/**
 * UI Schema structure
 */
export interface UISchema {
  sections: SectionConfig[];
}

/**
 * Widget value type
 */
export type WidgetValue = any;

/**
 * Widget state in Redux store
 */
export interface WidgetState {
  values: Record<string, WidgetValue>; // widget-id -> value
  errors: Record<string, string[]>; // widget-id -> error messages
  touched: Record<string, boolean>; // widget-id -> touched state
  loading: Record<string, boolean>; // widget-id -> loading state
  dataSources: Record<string, any[]>; // widget-id -> data source options
}

/**
 * Widget context value
 */
export interface WidgetContextValue {
  widgetId: string;
  value: WidgetValue;
  error: string[];
  touched: boolean;
  loading: boolean;
  onChange: (value: WidgetValue) => void;
  onBlur: () => void;
  setError: (errors: string[]) => void;
  getFieldValue: (path: string) => any;
  getDataSource: (widgetId: string) => any[];
}

/**
 * Custom widget render function
 */
export type WidgetRenderFunction = (
  config: BaseWidgetConfig,
  context: WidgetContextValue
) => React.ReactNode;

/**
 * Widget registry entry
 */
export interface WidgetRegistryEntry {
  widget: string;
  component: React.ComponentType<any> | WidgetRenderFunction;
  defaultProps?: Record<string, any>;
}

/**
 * API adapter function type
 */
export type ApiAdapter = (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    params?: Record<string, any>;
  }
) => Promise<any>;

