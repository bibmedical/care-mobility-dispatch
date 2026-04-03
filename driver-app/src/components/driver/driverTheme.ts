import { StyleSheet } from 'react-native';

export const driverTheme = {
  colors: {
    appBg: '#f4f5f7',
    surface: '#ffffff',
    surfaceMuted: '#f0f2f5',
    surfaceElevated: '#dbe4f4',
    border: '#e5e8ee',
    borderStrong: '#c8d0db',
    primary: '#3263ff',
    headerBg: '#3263ff',
    headerText: '#ffffff',
    primarySoft: '#dbe4f4',
    primaryText: '#4f6df2',
    accent: '#3263ff',
    accentSoft: '#e2eaff',
    text: '#1f2c39',
    textMuted: '#4a5a6a',
    textSoft: '#8390a0',
    success: '#e0f5ea',
    warning: '#fff4dd',
    danger: '#ffe7eb',
    info: '#e8f3ff',
    white: '#ffffff'
  },
  radius: {
    xl: 24,
    lg: 20,
    md: 18,
    sm: 16,
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
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 14,
    backgroundColor: driverTheme.colors.appBg
  },
  card: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.xl,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  softCard: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: driverTheme.radius.md,
    padding: 14,
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
    fontSize: 20,
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
    borderRadius: driverTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8
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
    paddingVertical: 14,
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
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: driverTheme.colors.primaryText,
    fontWeight: '800'
  },
  input: {
    minHeight: 110,
    borderRadius: 18,
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