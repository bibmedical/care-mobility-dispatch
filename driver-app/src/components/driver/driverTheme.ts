import { StyleSheet } from 'react-native';

export const driverTheme = {
  colors: {
    appBg: '#f4f6f9',
    surface: '#ffffff',
    surfaceMuted: '#f8fafc',
    surfaceElevated: '#fff8eb',
    border: '#d7dee8',
    borderStrong: '#8fa1b8',
    primary: '#d97706',
    headerBg: '#111827',
    headerText: '#ffffff',
    primarySoft: '#fff4dc',
    primaryText: '#8a4300',
    accent: '#f59e0b',
    accentSoft: '#fff7e6',
    text: '#0f172a',
    textMuted: '#334155',
    textSoft: '#64748b',
    success: '#e7f8ef',
    warning: '#fff3cd',
    danger: '#fee2e2',
    info: '#e0ecff',
    white: '#ffffff'
  },
  radius: {
    xl: 14,
    lg: 12,
    md: 10,
    sm: 8,
    pill: 999
  },
  spacing: {
    xs: 8,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 20
  }
};

export const driverSharedStyles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
    backgroundColor: driverTheme.colors.appBg
  },
  card: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.xl,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  softCard: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: driverTheme.radius.md,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  eyebrow: {
    color: driverTheme.colors.primaryText,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  title: {
    color: driverTheme.colors.text,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 4
  },
  body: {
    color: driverTheme.colors.textMuted,
    lineHeight: 20,
    marginTop: 4
  },
  hint: {
    color: driverTheme.colors.textSoft,
    fontWeight: '700'
  },
  pill: {
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  pillText: {
    color: driverTheme.colors.primaryText,
    fontSize: 12,
    fontWeight: '800'
  },
  primaryButton: {
    flex: 1,
    backgroundColor: driverTheme.colors.primary,
    borderRadius: driverTheme.radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#d97706',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  primaryButtonText: {
    color: driverTheme.colors.white,
    fontWeight: '800'
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: driverTheme.colors.primarySoft,
    borderRadius: driverTheme.radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: driverTheme.colors.primaryText,
    fontWeight: '800'
  },
  input: {
    minHeight: 108,
    borderRadius: driverTheme.radius.md,
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: driverTheme.colors.text,
    textAlignVertical: 'top'
  },
  warningText: {
    color: '#b54737',
    lineHeight: 19
  },
  emptyText: {
    color: driverTheme.colors.textMuted,
    lineHeight: 20
  }
});