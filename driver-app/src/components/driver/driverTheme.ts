import { StyleSheet } from 'react-native';

export const driverTheme = {
  colors: {
    appBg: '#eef2f5',
    surface: '#ffffff',
    surfaceMuted: '#f8fafc',
    surfaceElevated: '#ecfdf3',
    border: '#d5dde5',
    borderStrong: '#94a3b8',
    primary: '#198754',
    headerBg: '#0f172a',
    headerText: '#ffffff',
    primarySoft: '#dcfce7',
    primaryText: '#166534',
    accent: '#198754',
    accentSoft: '#ecfdf5',
    text: '#0f172a',
    textMuted: '#334155',
    textSoft: '#64748b',
    success: '#dcfce7',
    warning: '#fef3c7',
    danger: '#fee2e2',
    info: '#dbeafe',
    white: '#ffffff'
  },
  radius: {
    xl: 12,
    lg: 10,
    md: 8,
    sm: 6,
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
    borderColor: driverTheme.colors.border
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
    justifyContent: 'center'
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