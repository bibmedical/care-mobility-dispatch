import { StyleSheet } from 'react-native';

export const driverTheme = {
  colors: {
    appBg: '#eff8fc',
    surface: '#ffffff',
    surfaceMuted: '#f5fbff',
    surfaceElevated: '#e7f7fb',
    border: '#d6e4ef',
    borderStrong: '#87a7c0',
    primary: '#1fbad4',
    headerBg: '#1b2a62',
    headerText: '#ffffff',
    primarySoft: '#dff7fb',
    primaryText: '#20306d',
    accent: '#25356f',
    accentSoft: '#e7eefb',
    text: '#12203f',
    textMuted: '#314c72',
    textSoft: '#6783a2',
    success: '#e4eefb',
    warning: '#fef3c7',
    danger: '#fee2e2',
    info: '#dff7fb',
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