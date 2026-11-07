export interface AiSafetyEvent {
  timestamp: Date | string;
  deviceId: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category?: string;
  actionTaken: 'allow' | 'warn' | 'block';
  warningResponse?: 'proceeded' | 'dismissed';
}

export interface AiSafetyMetrics {
  score: number | null;
  interactions: number;
  safeInteractions: number;
  warnings: number;
  warningRecoveries: number;
  ignoredWarnings: number;
  highRiskAttempts: number;
}

const SENSITIVE_CATEGORIES = new Set([
  'api_key',
  'private_key',
  'password',
  'connection_string',
  'cloud_credential',
]);
const WARNING_RECOVERY_WINDOW_MS = 15 * 60 * 1000;

export function calculateAiSafetyMetrics(events: AiSafetyEvent[]): AiSafetyMetrics {
  const orderedEvents = [...events].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
  const safeEvents = orderedEvents.filter(
    (event) => event.actionTaken === 'allow' && event.riskLevel === 'LOW',
  );
  const dismissedWarnings: AiSafetyEvent[] = [];
  let warningRecoveries = 0;
  let warnings = 0;
  let ignoredWarnings = 0;
  let highRiskAttempts = 0;

  for (const event of orderedEvents) {
    if (event.warningResponse === 'dismissed') {
      dismissedWarnings.push(event);
    }

    if (event.warningResponse === 'proceeded' || (event.actionTaken === 'warn' && !event.warningResponse)) {
      ignoredWarnings++;
    }
    if (event.warningResponse || event.actionTaken === 'warn') warnings++;

    if (
      (event.actionTaken === 'warn' || event.actionTaken === 'block') &&
      (event.riskLevel === 'CRITICAL' || (event.riskLevel === 'HIGH' && SENSITIVE_CATEGORIES.has(event.category || '')))
    ) {
      highRiskAttempts++;
    }
  }

  for (const safeEvent of safeEvents) {
    const safeAt = new Date(safeEvent.timestamp).getTime();
    const recoveredIndex = dismissedWarnings.findIndex((warning) => {
      const warningAt = new Date(warning.timestamp).getTime();
      return warning.deviceId === safeEvent.deviceId &&
        warningAt <= safeAt &&
        safeAt - warningAt <= WARNING_RECOVERY_WINDOW_MS;
    });
    if (recoveredIndex >= 0) {
      dismissedWarnings.splice(recoveredIndex, 1);
      warningRecoveries++;
    }
  }

  const interactions = orderedEvents.length;
  if (interactions === 0) {
    return {
      score: null,
      interactions: 0,
      safeInteractions: 0,
      warnings: 0,
      warningRecoveries: 0,
      ignoredWarnings: 0,
      highRiskAttempts: 0,
    };
  }

  const safeInteractions = safeEvents.length;
  const warningPenalty = ignoredWarnings === 0 ? 0 : 2 + (ignoredWarnings - 1) * 3;
  const score = Math.max(0, Math.min(
    100,
    Math.round(
      60 +
      Math.min(20, safeInteractions * 0.3) +
      (20 * Math.log1p(safeInteractions)) / Math.log1p(100) +
      Math.min(15, warningRecoveries * 3) -
      warningPenalty -
      highRiskAttempts * 10,
    ),
  ));

  return {
    score,
    interactions,
    safeInteractions,
    warnings,
    warningRecoveries,
    ignoredWarnings,
    highRiskAttempts,
  };
}
