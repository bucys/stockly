import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCompanyId } from '@/lib/useCompanyId';
import {
  getCategoriesWithProducts,
  createCategory,
  updateCategory,
  deleteCategory,
  CategoryWithProducts,
  ProductRow,
} from '@/services/categories';
import { createProduct, updateProduct, deleteProduct } from '@/services/products';
import {
  getSourceLocations,
  getSourceData,
  importSetup,
  ImportMode,
  SourceLocation,
} from '@/services/import';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { theme, shadows } from '@/constants/theme';

const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'box', 'bottle', 'pack', 'bag', 'roll', 'm'];

interface EditingProduct extends ProductRow {
  categoryId: string;
}

type ImportStep = 'select-location' | 'select-categories' | null;

export default function LocationDetailScreen() {
  const { locationId, name } = useLocalSearchParams<{ locationId: string; name: string }>();
  const { companyId, role } = useCompanyId();

  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);

  // Category modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<{ id: string; name: string } | null>(null);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  // Product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null);
  const [productCatId, setProductCatId] = useState('');
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('pcs');
  const [productLastQty, setProductLastQty] = useState('');
  const [productSaving, setProductSaving] = useState(false);

  // Import flow
  const [importStep, setImportStep] = useState<ImportStep>(null);
  const [sourceLocations, setSourceLocations] = useState<SourceLocation[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [selectedSourceName, setSelectedSourceName] = useState('');
  const [sourceCategories, setSourceCategories] = useState<CategoryWithProducts[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<ImportMode>('add');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      setCategories(await getCategoriesWithProducts(locationId));
    } catch {
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Category handlers ───────────────────────────────────────────────────────

  function openCreateCategory() {
    setEditingCat(null);
    setCatName('');
    setShowCatModal(true);
  }

  function openEditCategory(cat: { id: string; name: string }) {
    setEditingCat(cat);
    setCatName(cat.name);
    setShowCatModal(true);
  }

  async function handleSaveCategory() {
    if (!catName.trim() || !locationId) return;
    setCatSaving(true);
    try {
      if (editingCat) {
        await updateCategory(editingCat.id, catName.trim());
      } else {
        await createCategory(locationId, catName.trim());
      }
      setShowCatModal(false);
      load();
    } catch {
      Alert.alert('Error', 'Failed to save category');
    } finally {
      setCatSaving(false);
    }
  }

  function handleCategoryActions(cat: { id: string; name: string }) {
    Alert.alert(cat.name, '', [
      { text: 'Rename', onPress: () => openEditCategory(cat) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Delete category?',
            'All products and any inventory data recorded for them will be permanently deleted.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteCategory(cat.id);
                    load();
                  } catch {
                    Alert.alert('Error', 'Failed to delete category');
                  }
                },
              },
            ],
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // ── Product handlers ────────────────────────────────────────────────────────

  function openCreateProduct(categoryId: string) {
    setEditingProduct(null);
    setProductCatId(categoryId);
    setProductName('');
    setProductUnit('pcs');
    setProductLastQty('');
    setShowProductModal(true);
  }

  function openEditProduct(product: ProductRow, categoryId: string) {
    setEditingProduct({ ...product, categoryId });
    setProductCatId(categoryId);
    setProductName(product.name);
    setProductUnit(product.unit);
    setProductLastQty(product.last_known_quantity != null ? String(product.last_known_quantity) : '');
    setShowProductModal(true);
  }

  async function handleSaveProduct() {
    if (!productName.trim() || !productCatId) return;
    setProductSaving(true);
    const lastQty = productLastQty ? parseFloat(productLastQty) : undefined;
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, productName.trim(), productUnit, lastQty, productCatId);
      } else {
        await createProduct(productCatId, productName.trim(), productUnit, lastQty);
      }
      setShowProductModal(false);
      load();
    } catch {
      Alert.alert('Error', 'Failed to save product');
    } finally {
      setProductSaving(false);
    }
  }

  function handleProductPress(product: ProductRow, categoryId: string) {
    const actions: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] = [
      { text: 'Edit', onPress: () => openEditProduct(product, categoryId) },
    ];
    if (role === 'admin') {
      actions.push({
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete product?', `"${product.name}" will be removed.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deleteProduct(product.id);
                  load();
                } catch {
                  Alert.alert('Error', 'Failed to delete product');
                }
              },
            },
          ]),
      });
    }
    actions.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(product.name, '', actions);
  }

  // ── Import handlers ─────────────────────────────────────────────────────────

  async function openImport() {
    if (!locationId || !companyId) {
      Alert.alert('Error', 'Company membership not loaded. Please wait and try again.');
      return;
    }
    setLoadingSource(true);
    setImportStep('select-location');
    try {
      const locs = await getSourceLocations(companyId, locationId);
      if (locs.length === 0) {
        Alert.alert('No other locations', 'Create another location first.');
        setImportStep(null);
        return;
      }
      setSourceLocations(locs);
    } catch {
      Alert.alert('Error', 'Failed to load locations');
      setImportStep(null);
    } finally {
      setLoadingSource(false);
    }
  }

  async function handleSelectSource(locId: string, locName: string) {
    setSelectedSourceId(locId);
    setSelectedSourceName(locName);
    setLoadingSource(true);
    setImportStep('select-categories');
    try {
      const data = await getSourceData(locId);
      if (data.length === 0) {
        Alert.alert('No data', `${locName} has no categories or products to import.`);
        setImportStep('select-location');
        return;
      }
      setSourceCategories(data);
      setSelectedCatIds(new Set(data.map((c) => c.id)));
      setImportMode('add');
    } catch {
      Alert.alert('Error', 'Failed to load source data');
      setImportStep('select-location');
    } finally {
      setLoadingSource(false);
    }
  }

  function toggleCategoryId(catId: string) {
    setSelectedCatIds((prev) => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  }

  function toggleSelectAll() {
    const allSelected = selectedCatIds.size === sourceCategories.length;
    setSelectedCatIds(allSelected ? new Set() : new Set(sourceCategories.map((c) => c.id)));
  }

  async function handleImport() {
    if (!locationId || !selectedSourceId || selectedCatIds.size === 0) return;
    const selected = sourceCategories.filter((c) => selectedCatIds.has(c.id));

    if (importMode === 'replace') {
      Alert.alert(
        'Replace all data?',
        'This will delete all existing categories and products in this location.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: () => executeImport(selected) },
        ],
      );
    } else {
      executeImport(selected);
    }
  }

  async function executeImport(selected: CategoryWithProducts[]) {
    if (!locationId || !selectedSourceId || !companyId) return;
    setImporting(true);
    try {
      const result = await importSetup({
        companyId,
        sourceLocationId: selectedSourceId,
        targetLocationId: locationId,
        selectedCategories: selected,
        mode: importMode,
      });
      closeImport();
      load();
      Alert.alert(
        'Import complete',
        `Created ${result.categoriesCreated} categories and ${result.productsCreated} products.`,
      );
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setImporting(false);
    }
  }

  function closeImport() {
    setImportStep(null);
    setSourceLocations([]);
    setSelectedSourceId('');
    setSelectedSourceName('');
    setSourceCategories([]);
    setSelectedCatIds(new Set());
    setImportMode('add');
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isEmpty = !loading && categories.length === 0;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: name ?? 'Location',
          headerRight: role === 'admin'
            ? () => (
                <TouchableOpacity onPress={openCreateCategory} style={styles.headerBtn}>
                  <Text style={styles.headerBtnText}>+ Category</Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No categories yet</Text>
          <Text style={styles.emptySub}>
            {role === 'admin' ? 'Tap "+ Category" to get started.' : 'No products set up yet.'}
          </Text>
          {role === 'admin' && (
            <TouchableOpacity style={styles.importEmptyBtn} onPress={openImport} activeOpacity={0.7}>
              <Text style={styles.importEmptyBtnText}>Import from another location</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            {categories.map((cat) => (
              <View key={cat.id} style={styles.section}>
                <View style={styles.categoryRow}>
                  <Text style={styles.categoryName}>{cat.name}</Text>
                  {role === 'admin' && (
                    <TouchableOpacity
                      style={styles.catMoreBtn}
                      onPress={() => handleCategoryActions(cat)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.catMoreBtnText}>···</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.addProductBtn}
                    onPress={() => openCreateProduct(cat.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.addProductText}>+ Product</Text>
                  </TouchableOpacity>
                </View>

                {cat.products.length === 0 ? (
                  <Text style={styles.noProducts}>No products — tap "+ Product" to add one.</Text>
                ) : (
                  cat.products.map((product) => (
                    <TouchableOpacity
                      key={product.id}
                      style={styles.productRow}
                      onPress={() => handleProductPress(product, cat.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.productName}>{product.name}</Text>
                      <Text style={styles.productMeta}>
                        {product.unit}
                        {product.last_known_quantity != null ? ` · ${product.last_known_quantity}` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ))}
          </ScrollView>

          {role === 'admin' && (
            <TouchableOpacity style={styles.importFooterBtn} onPress={openImport} activeOpacity={0.8}>
              <Text style={styles.importFooterBtnText}>Import / Copy setup</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── Category modal ─────────────────────────────────────────────────── */}
      <ModalSheet
        visible={showCatModal}
        onClose={() => setShowCatModal(false)}
      >
        <Text style={styles.sheetTitle}>
          {editingCat ? 'Rename category' : 'New category'}
        </Text>
        <Input
          placeholder="Category name"
          value={catName}
          onChangeText={setCatName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSaveCategory}
        />
        <Button
          title="Save"
          onPress={handleSaveCategory}
          loading={catSaving}
          disabled={!catName.trim()}
        />
        <Button title="Cancel" onPress={() => setShowCatModal(false)} variant="ghost" />
      </ModalSheet>

      {/* ── Product modal ──────────────────────────────────────────────────── */}
      <ModalSheet
        visible={showProductModal}
        onClose={() => setShowProductModal(false)}
        scrollable
        maxHeight="90%"
      >
        <Text style={styles.sheetTitle}>
          {editingProduct ? 'Edit product' : 'New product'}
        </Text>
        <Text style={styles.fieldLabel}>Name</Text>
        <Input
          placeholder="Product name"
          value={productName}
          onChangeText={setProductName}
          autoFocus
        />
        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.chipsWrap}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, productCatId === cat.id && styles.chipSelected]}
              onPress={() => setProductCatId(cat.id)}
            >
              <Text style={[styles.chipText, productCatId === cat.id && styles.chipTextSelected]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Unit</Text>
        <View style={styles.chipsWrap}>
          {UNITS.map((unit) => (
            <TouchableOpacity
              key={unit}
              style={[styles.chip, productUnit === unit && styles.chipSelected]}
              onPress={() => setProductUnit(unit)}
            >
              <Text style={[styles.chipText, productUnit === unit && styles.chipTextSelected]}>
                {unit}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Last known quantity (optional)</Text>
        <Input
          placeholder="e.g. 50"
          value={productLastQty}
          onChangeText={setProductLastQty}
          keyboardType="decimal-pad"
        />
        <Button
          title="Save"
          onPress={handleSaveProduct}
          loading={productSaving}
          disabled={!productName.trim() || !productCatId}
        />
        <Button title="Cancel" onPress={() => setShowProductModal(false)} variant="ghost" />
      </ModalSheet>

      {/* ── Import modal ───────────────────────────────────────────────────── */}
      <ModalSheet
        visible={importStep !== null}
        onClose={closeImport}
        avoidKeyboard={false}
        maxHeight="85%"
      >
        {/* Step 1: source location picker */}
        {importStep === 'select-location' && (
          <>
            <Text style={styles.sheetTitle}>Import from location</Text>
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
                    onPress={() => handleSelectSource(item.id, item.name)}
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
            <Button title="Cancel" onPress={closeImport} variant="ghost" />
          </>
        )}

        {/* Step 2: category selection + mode */}
        {importStep === 'select-categories' && (
          <>
            <TouchableOpacity
              style={styles.importBackRow}
              onPress={() => setImportStep('select-location')}
            >
              <Text style={styles.importBackText}>‹ {selectedSourceName}</Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Mode</Text>
            <View style={styles.chipsWrap}>
              {(['add', 'replace'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.chip, importMode === m && styles.chipSelected]}
                  onPress={() => setImportMode(m)}
                >
                  <Text style={[styles.chipText, importMode === m && styles.chipTextSelected]}>
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

            <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll}>
              <View style={[styles.checkbox, selectedCatIds.size === sourceCategories.length && styles.checkboxChecked]}>
                {selectedCatIds.size === sourceCategories.length && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
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
                    onPress={() => toggleCategoryId(cat.id)}
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
              onPress={handleImport}
              loading={importing}
              disabled={selectedCatIds.size === 0}
            />
            <Button title="Cancel" onPress={closeImport} variant="ghost" />
          </>
        )}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: theme.spacing.lg, gap: 14, paddingBottom: 88 },

  // Category section card
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F2F2EF',
  },
  categoryName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  catMoreBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  catMoreBtnText: { fontSize: 13, color: '#555555', letterSpacing: 1.5 },
  addProductBtn: { paddingVertical: 4, paddingLeft: 4 },
  addProductText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  noProducts: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    color: theme.colors.textPlaceholder,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  productName: { flex: 1, fontSize: 16, color: theme.colors.text, fontWeight: '400' },
  productMeta: { fontSize: 13, color: theme.colors.textLight },

  // Empty state
  emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6 },
  emptySub: { fontSize: 14, color: theme.colors.textLight, marginBottom: 24, textAlign: 'center' },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
  importEmptyBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  importEmptyBtnText: { fontSize: 15, color: theme.colors.textSecondary, fontWeight: '600' },
  importFooterBtn: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 18,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  importFooterBtnText: { fontSize: 15, color: theme.colors.textMuted, fontWeight: '600' },

  // Modal shared
  sheetTitle: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 18 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textLight,
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 14, color: theme.colors.textSecondary },
  chipTextSelected: { color: '#fff', fontWeight: '600' },

  // Import modal
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
