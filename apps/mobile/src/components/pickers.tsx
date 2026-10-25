import { COUNTRIES, countryName, dialCode, flag } from '@jump/shared/countries';
import type { Gender } from '@jump/shared/types';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontFamily, GUTTER, radius } from '@/lib/theme';
import { CheckIcon, ChevronDownIcon, SearchIcon } from './icons';
import { OptionSheet, Sheet } from './Sheet';
import { FieldLabel, haptic, Hint, Txt } from './ui';

/** Countries most Jump runners pick, shown first. */
const PINNED = ['NG', 'GH', 'KE', 'ZA', 'GB', 'US'];

/** The closed state of a picker: looks like a text field, opens a sheet. */
export function PickerField({ label, optional, hint, error, value, placeholder, onPress, leading }: { label?: string; optional?: boolean; hint?: string; error?: string; value: string | null; placeholder: string; onPress: () => void; leading?: React.ReactNode }) {
  return <View>
    {label ? <FieldLabel label={label} optional={optional} /> : null}
    <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="button" accessibilityLabel={label ?? placeholder} accessibilityHint={value ?? undefined}
      style={({ pressed }) => [styles.field, error ? { borderColor: colors.bad } : null, pressed && { borderColor: colors.edge }]}>
      {leading}
      <Text numberOfLines={1} style={[styles.value, !value && { color: colors.ink3 }]}>{value ?? placeholder}</Text>
      <ChevronDownIcon size={16} color={colors.ink3} />
    </Pressable>
    {error ? <Hint error>{error}</Hint> : hint ? <Hint>{hint}</Hint> : null}
  </View>;
}

/** Searchable country list with flags, for the picker and the phone field's dial code. */
function CountrySheet({ open, onOpenChange, value, onPick, showDial }: { open: boolean; onOpenChange: (open: boolean) => void; value: string; onPick: (code: string) => void; showDial?: boolean }) {
  const [term, setTerm] = useState('');
  useEffect(() => { if (!open) setTerm(''); }, [open]);
  const options = useMemo(() => {
    const query = term.trim().toLowerCase().replace(/^\+/, '');
    if (!query) return [...PINNED.map((code) => [code, countryName(code)] as [string, string]), ...COUNTRIES.filter(([code]) => !PINNED.includes(code))];
    return COUNTRIES.filter(([code, name]) => name.toLowerCase().includes(query) || code.toLowerCase() === query || dialCode(code).startsWith(query));
  }, [term]);

  return <Sheet open={open} onOpenChange={onOpenChange} title={showDial ? 'Country code' : 'Country'} scroll={false}>
    <View style={{ paddingHorizontal: GUTTER + 4, paddingBottom: 8 }}>
      <View style={styles.search}>
        <SearchIcon size={16} color={colors.ink3} />
        <TextInput autoFocus value={term} onChangeText={setTerm} placeholder={showDial ? 'Search country or code' : 'Search countries'} placeholderTextColor={colors.ink3}
          style={styles.searchInput} autoCorrect={false} accessibilityLabel="Search countries" returnKeyType="search" />
      </View>
    </View>
    <FlatList
      data={options}
      keyExtractor={([code]) => code}
      keyboardShouldPersistTaps="handled"
      style={{ height: 420 }}
      ListEmptyComponent={<Txt size={13} color="ink3" align="center" style={{ paddingVertical: 24 }}>No country matches “{term}”.</Txt>}
      renderItem={({ item: [code, name], index }) => <Pressable onPress={() => { haptic(); onPick(code); onOpenChange(false); }} accessibilityRole="radio" accessibilityState={{ checked: code === value }}
        style={({ pressed }) => [styles.country, pressed && { backgroundColor: colors.inkWash }, !term && index === PINNED.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }]}>
        <Text style={{ fontSize: 22 }}>{flag(code)}</Text>
        <Txt size={15} numberOfLines={1} style={{ flex: 1 }}>{name}</Txt>
        {showDial ? <Txt size={13} color="ink3" num>+{dialCode(code)}</Txt> : null}
        {code === value ? <CheckIcon size={16} color={colors.track} /> : null}
      </Pressable>}
    />
  </Sheet>;
}

export function CountryPicker({ label, optional, hint, value, onChange, placeholder = 'Choose your country' }: { label?: string; optional?: boolean; hint?: string; value: string; onChange: (code: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <PickerField label={label} optional={optional} hint={hint} value={value ? countryName(value) : null} placeholder={placeholder} onPress={() => setOpen(true)}
      leading={value ? <Text style={{ fontSize: 20 }}>{flag(value)}</Text> : undefined} />
    <CountrySheet open={open} onOpenChange={setOpen} value={value} onPick={onChange} />
  </>;
}

function splitNumber(value: string, fallback: string) {
  if (!value.startsWith('+')) return { country: fallback, local: value };
  const digits = value.slice(1);
  const matches = COUNTRIES.map(([code]) => code).filter((code) => dialCode(code) && digits.startsWith(dialCode(code)));
  const best = matches.sort((a, b) => dialCode(b).length - dialCode(a).length || Number(b === fallback) - Number(a === fallback))[0];
  return best ? { country: best, local: digits.slice(dialCode(best).length) } : { country: fallback, local: digits };
}

/**
 * Phone number with a flag + dial-code button. Calls `onChange` with the full international number
 * ("+2348012345678"), or "" while empty. The dial code follows `defaultCountry` until picked.
 */
export function PhoneField({ label, optional, hint, value, onChange, defaultCountry }: { label?: string; optional?: boolean; hint?: string; value: string; onChange: (e164: string) => void; defaultCountry?: string }) {
  const [initial] = useState(() => splitNumber(value, defaultCountry || 'NG'));
  const [country, setCountry] = useState(initial.country);
  const [picked, setPicked] = useState(Boolean(value));
  const [local, setLocal] = useState(initial.local);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!picked && defaultCountry) setCountry(defaultCountry); }, [defaultCountry, picked]);

  const digits = local.replace(/\D/g, '').replace(/^0+/, ''); // "0803…" → "803…", the usual local-format habit
  const full = digits ? `+${dialCode(country)}${digits}` : '';
  useEffect(() => { if (full !== value) onChange(full); }, [full, value, onChange]);

  return <View>
    {label ? <FieldLabel label={label} optional={optional} /> : null}
    <View style={[styles.field, { paddingHorizontal: 0 }, focused && { borderColor: colors.edge }]}>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Country code ${countryName(country)} +${dialCode(country)}`}
        style={({ pressed }) => [styles.dial, pressed && { backgroundColor: colors.inkWash }]}>
        <Text style={{ fontSize: 19 }}>{flag(country)}</Text>
        <Txt size={15} weight="semibold" num>+{dialCode(country)}</Txt>
        <ChevronDownIcon size={14} color={colors.ink3} />
      </Pressable>
      <TextInput value={local} onChangeText={(text) => setLocal(text.replace(/[^\d\s-]/g, ''))} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel"
        placeholder="801 234 5678" placeholderTextColor={colors.ink3} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={[styles.value, { paddingHorizontal: 12, height: '100%' }]} accessibilityLabel={label ?? 'Phone number'} />
    </View>
    {hint ? <Hint>{hint}</Hint> : null}
    <CountrySheet showDial open={open} onOpenChange={setOpen} value={country} onPick={(code) => { setCountry(code); setPicked(true); }} />
  </View>;
}

const GENDERS: Array<{ value: Gender | 'later'; label: string }> = [
  { value: 'later', label: 'Choose later' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function GenderSelect({ label = 'Gender', optional, hint, value, onChange }: { label?: string; optional?: boolean; hint?: string; value: Gender | ''; onChange: (value: Gender | '') => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <PickerField label={label} optional={optional} hint={hint} value={GENDERS.find((option) => option.value === (value || 'later'))?.label ?? null} placeholder="Choose later" onPress={() => setOpen(true)} />
    <OptionSheet open={open} onOpenChange={setOpen} title={label} options={GENDERS} value={value || 'later'} onChange={(next) => onChange(next === 'later' ? '' : next)} />
  </>;
}

/** A labelled single choice from a short list, as a field that opens a sheet. */
export function SelectField<T extends string>({ label, optional, hint, error, value, options, onChange, placeholder = 'Choose', leading }: { label: string; optional?: boolean; hint?: string; error?: string; value: T | null; options: Array<{ value: T; label: string; detail?: string; disabled?: boolean; icon?: React.ReactNode }>; onChange: (value: T) => void; placeholder?: string; leading?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <PickerField label={label} optional={optional} hint={hint} error={error} value={options.find((option) => option.value === value)?.label ?? null} placeholder={placeholder} onPress={() => setOpen(true)} leading={leading} />
    <OptionSheet open={open} onOpenChange={setOpen} title={label} options={options} value={value} onChange={onChange} />
  </>;
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, borderRadius: radius.base, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 14, overflow: 'hidden' },
  value: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
  dial: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch', paddingHorizontal: 12, borderRightWidth: 1.5, borderRightColor: colors.line },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.white, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
  country: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER + 4, paddingVertical: 12 },
});
