// src/services/appInsights.ts
// Application Insights service singleton

import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';

// Create React plugin
export const reactPlugin = new ReactPlugin();

// Initialize Application Insights
const appInsights = new ApplicationInsights({
  config: {
    connectionString: process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING || '',
    extensions: [reactPlugin],
    enableAutoRouteTracking: true,
    enableRequestHeaderTracking: true,
    enableResponseHeaderTracking: true,
    enableAjaxErrorStatusText: true,
    enableAjaxPerfTracking: true,
    enableUnhandledPromiseRejectionTracking: true,
    disableExceptionTracking: false,
    enableCorsCorrelation: true,
    distributedTracingMode: 2, // W3C
    autoTrackPageVisitTime: true,
    enableClickAnalyticsPlugin: true,
  },
});

// Load Application Insights
if (process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING) {
  appInsights.loadAppInsights();
  console.log('Application Insights loaded successfully');
} else {
  console.warn('Application Insights connection string not found. Telemetry will not be sent.');
}

// Export the instance
export { appInsights };
export default appInsights;