import { View, Text, TouchableOpacity, FlatList, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';
import { sheetStyles } from './sheetStyles';
import type { CategoryWithProducts } from '@/services/categories';
import type { ImportMode, SourceLocation } from '@/services/import';

type ImportStep = 'select-location' | 'select-categories' | null;

interface Props {
  step: ImportStep;
  loadingSource: boolean;
  sourceLocations: SourceLocation[];
  selectedSourceName: string;
  sourceCategories: CategoryWithProducts[];
  selectedCatIds: Set<string>;
  importMode: ImportMode;
  importing: boolean;
  onSelectSource: (id: string, name: string) => void;
  onBack: () => void;
  onSelectMode: (mode: ImportMode) => void;
  onToggleCategory: (categoryId: string) => void;
  onToggleSelectAll: () => void;
  onImport: () => void;
  onClose: () => void;
}

export function CopyFromLocationSheet({
  step,
  loadingSource,
  sourceLocations,
  selectedSourceName,
  sourceCategories,
  selectedCatIds,
  importMode,
  importing,
  onSelectSource,
  onBack,
  onSelectMode,
  onToggleCategory,
  onToggleSelectAll,
  onImport,
  onClose,
}: Props) {
  const allSelected = selectedCatIds.size === sourceCategories.length;

  return (
    <ModalSheet visible={step !== null} onClose={onClose} avoidKeyboard={false} maxHeight="85%">
      {step === 'select-location' && (
        <>
          <Text style={sheetStyles.sheetTitle}>Import from location</Text>
          {loadingSource ? (
            <View style={styles.importLoading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <FlatList
              data={sourceLocations}
              keyExtractor={(item) => item.id}
              style={styles.importList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.importLocationRow}
                  onPress={() => onSelectSource(item.id, item.name)}
                  activeOpacity={0.7}
                >
                  <View style={styles.importLocationInfo}>
                    <Text style={styles.importLocationName}>{item.name}</Text>
                    <Text style={styles.importLocationMeta}>
                      {item.categoryCount} {item.categoryCount === 1 ? 'category' : 'categories'} · {item.productCount} {item.productCount === 1 ? 'product' : 'products'}
                    </Text>
                  </View>
                  <Text style={styles.importArrow}>›</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.importSeparator} />}
            />
          )}
          <Button title="Cancel" onPress={onClose} variant="ghost" />
        </>
      )}

      {step === 'select-categories' && (
        <>
          <TouchableOpacity style={styles.importBackRow} onPress={onBack}>
            <Text style={styles.importBackText}>‹ {selectedSourceName}</Text>
          </TouchableOpacity>

          <Text style={sheetStyles.fieldLabel}>Mode</Text>
          <View style={sheetStyles.chipsWrap}>
            {(['add', 'replace'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[sheetStyles.chip, importMode === m && sheetStyles.chipSelected]}
                onPress={() => onSelectMode(m)}
              >
                <Text style={[sheetStyles.chipText, importMode === m && sheetStyles.chipTextSelected]}>
                  {m === 'add' ? 'Add' : 'Replace all'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {importMode === 'replace' && (
            <Text style={styles.replaceWarning}>
              Replace will delete all existing categories and products.
            </Text>
          )}

          <TouchableOpacity style={styles.selectAllRow} onPress={onToggleSelectAll}>
            <View style={[styles.checkbox, allSelected && styles.checkboxChecked]}>
              {allSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.selectAllText}>Select all</Text>
          </TouchableOpacity>

          {loadingSource ? (
            <View style={styles.importLoading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.importCatList} showsVerticalScrollIndicator={false}>
              {sourceCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.importCatRow}
                  onPress={() => onToggleCategory(cat.id)}
                >
                  <View style={[styles.checkbox, selectedCatIds.has(cat.id) && styles.checkboxChecked]}>
                    {selectedCatIds.has(cat.id) && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.importCatName}>{cat.name}</Text>
                  <Text style={styles.importCatCount}>
                    {cat.products.length} product{cat.products.length !== 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Button
            title={`Import (${selectedCatIds.size} ${selectedCatIds.size === 1 ? 'category' : 'categories'})`}
            onPress={onImport}
            loading={importing}
            disabled={selectedCatIds.size === 0}
          />
          <Button title="Cancel" onPress={onClose} variant="ghost" />
        </>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  importList: { maxHeight: 280, marginBottom: 8 },
  importLoading: { height: 80, alignItems: 'center', justifyContent: 'center' },
  importLocationRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  importLocationInfo: { flex: 1 },
  importLocationName: { fontSize: 16, color: theme.colors.text, fontWeight: '500' },
  importLocationMeta: { fontSize: 12, color: theme.colors.textLight, marginTop: 2 },
  importArrow: { fontSize: 20, color: '#BBBBB8' },
  importSeparator: { height: 1, backgroundColor: theme.colors.borderLight },
  importBackRow: { marginBottom: 16 },
  importBackText: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },
  replaceWarning: { fontSize: 12, color: theme.colors.danger, marginBottom: 14, marginTop: 4 },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  selectAllText: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginLeft: 10 },
  importCatList: { maxHeight: 220, marginBottom: 18 },
  importCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  importCatName: { flex: 1, fontSize: 15, color: theme.colors.text, marginLeft: 10 },
  importCatCount: { fontSize: 13, color: theme.colors.textLight },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkmark: { fontSize: 12, color: '#fff', fontWeight: '700' },
});
