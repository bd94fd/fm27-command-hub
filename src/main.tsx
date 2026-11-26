import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {AppErrorBoundary} from './components/AppErrorBoundary.tsx';
import {installGlobalErrorReporting} from './utils/errorReport.ts';
import './index.css';

installGlobalErrorReporting();

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary scopeLabel="FM27 Command Hub Shell">
    <App />
  </AppErrorBoundary>
);
