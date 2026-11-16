import type { CrashLogStore } from '../core/crashLog';
import type { LocaleCode } from '../core/save';
import { getStrings } from '../i18n/strings';

export interface ErrorBoundaryOptions {
  crashLog: CrashLogStore;
  appVersion: string;
  getLocale: () => LocaleCode;
  onCrash?: () => void;
}

/**
 * Global runtime safety net: captures unexpected errors + unhandled promise rejections,
 * writes them to CrashLogStore (isolated from SaveStore), and renders a clean recovery modal.
 */
export function installGlobalErrorBoundary(options: ErrorBoundaryOptions): () => void {
  let modalOpen = false;

  const showRecoveryOverlay = (summary: string): void => {
    if (modalOpen) return;
    modalOpen = true;
    options.onCrash?.();

    const t = getStrings(options.getLocale());
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.setAttribute('role', 'alertdialog');
    backdrop.dataset.testid = 'crash-recovery-modal';

    const panel = document.createElement('div');
    panel.className = 'modal-panel';

    const title = document.createElement('h2');
    title.textContent = t.crashTitle;

    const body = document.createElement('p');
    body.textContent = t.crashBody;

    const pre = document.createElement('pre');
    pre.className = 'crash-pre';
    pre.textContent = summary;

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'hud-btn';
    copyBtn.textContent = t.crashCopyButton;
    copyBtn.addEventListener('click', () => {
      const text = options.crashLog.formatText();
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      copyBtn.textContent = t.crashCopied;
    });

    const reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.className = 'hud-btn active';
    reloadBtn.textContent = t.crashReloadButton;
    reloadBtn.addEventListener('click', () => {
      window.location.reload();
    });

    actions.append(copyBtn, reloadBtn);
    panel.append(title, body, pre, actions);
    backdrop.append(panel);
    document.body.append(backdrop);
  };

  const handleError = (event: ErrorEvent): void => {
    const message = event.message || 'Unknown runtime error';
    const stack = event.error instanceof Error ? event.error.stack : undefined;
    options.crashLog.record({
      source: 'window.onerror',
      message,
      stack,
      version: options.appVersion,
    });
    showRecoveryOverlay(`${message}${stack ? `\n\n${stack}` : ''}`);
  };

  const handleRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection';
    const stack = reason instanceof Error ? reason.stack : undefined;
    options.crashLog.record({
      source: 'unhandledrejection',
      message,
      stack,
      version: options.appVersion,
    });
    showRecoveryOverlay(`${message}${stack ? `\n\n${stack}` : ''}`);
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
