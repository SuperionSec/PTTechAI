import { useTranslation } from 'react-i18next'

// Scan phase mapping
export function usePhaseLabels() {
  const { t } = useTranslation()
  return {
    recon: t('autoPentest.recon'),
    analysis: t('autoPentest.analysis'),
    testing: t('autoPentest.testing'),
    enhancement: t('autoPentest.enhancement'),
    completed: t('autoPentest.completed'),
    stopped: t('common.stopped'),
    error: t('common.error'),
    pending: t('common.pending'),
    running: t('common.running'),
  }
}

// Scan status mapping
export function useStatusLabels() {
  const { t } = useTranslation()
  return {
    running: t('common.running'),
    completed: t('common.completed'),
    stopped: t('common.stopped'),
    failed: t('common.failed'),
    pending: t('common.pending'),
    paused: t('common.paused'),
  }
}

// Severity mapping (for dynamic data from API)
export function useSeverityLabels() {
  const { t } = useTranslation()
  return {
    critical: t('severity.critical'),
    high: t('severity.high'),
    medium: t('severity.medium'),
    low: t('severity.low'),
    info: t('severity.info'),
  }
}
