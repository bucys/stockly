import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  Platform,
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
          <ActivityIndicator />
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No categories yet.</Text>
          <Text style={styles.emptySub}>
            {role === 'admin' ? 'Tap "+ Category" to get started.' : 'No products set up yet.'}
          </Text>
          {role === 'admin' && (
            <TouchableOpacity style={styles.importEmptyBtn} onPress={openImport}>
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
            <TouchableOpacity style={styles.importFooterBtn} onPress={openImport}>
              <Text style={styles.importFooterBtnText}>Import / Copy setup</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── Category modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={showCatModal}
        animationType="slide"
        transparent
        onRequestClose={() => { Keyboard.dismiss(); setShowCatModal(false); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={styles.overlay}
            onPress={() => { Keyboard.dismiss(); setShowCatModal(false); }}
          >
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>
                {editingCat ? 'Rename category' : 'New category'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Category name"
                value={catName}
                onChangeText={setCatName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveCategory}
              />
              <TouchableOpacity
                style={[styles.button, (!catName.trim() || catSaving) && styles.buttonDisabled]}
                onPress={handleSaveCategory}
                disabled={!catName.trim() || catSaving}
              >
                {catSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { Keyboard.dismiss(); setShowCatModal(false); }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Product modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={showProductModal}
        animationType="slide"
        transparent
        onRequestClose={() => { Keyboard.dismiss(); setShowProductModal(false); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={styles.overlay}
            onPress={() => { Keyboard.dismiss(); setShowProductModal(false); }}
          >
            <Pressable style={styles.sheetScroll} onPress={() => {}}>
              <ScrollView
                contentContainerStyle={styles.sheetScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sheetTitle}>
                  {editingProduct ? 'Edit product' : 'New product'}
                </Text>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Product name"
                  value={productName}
                  onChangeText={setProductName}
                  autoFocus
                />
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.unitsWrap}>
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
                <View style={styles.unitsWrap}>
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
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 50"
                  value={productLastQty}
                  onChangeText={setProductLastQty}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={[styles.button, (!productName.trim() || !productCatId || productSaving) && styles.buttonDisabled]}
                  onPress={handleSaveProduct}
                  disabled={!productName.trim() || !productCatId || productSaving}
                >
                  {productSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { Keyboard.dismiss(); setShowProductModal(false); }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Import modal ───────────────────────────────────────────────────── */}
      <Modal visible={importStep !== null} animationType="slide" transparent onRequestClose={closeImport}>
        <Pressable style={styles.overlay} onPress={closeImport}>
          <Pressable style={styles.importSheet} onPress={() => {}}>

            {/* Step 1: source location picker */}
            {importStep === 'select-location' && (
              <>
                <Text style={styles.sheetTitle}>Import from location</Text>
                {loadingSource ? (
                  <View style={styles.importLoading}>
                    <ActivityIndicator />
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
                <TouchableOpacity style={styles.cancelBtn} onPress={closeImport}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
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

                {/* Mode selector */}
                <Text style={styles.fieldLabel}>Mode</Text>
                <View style={styles.modeRow}>
                  {(['add', 'replace'] as const).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.modeChip, importMode === m && styles.modeChipSelected]}
                      onPress={() => setImportMode(m)}
                    >
                      <Text style={[styles.modeChipText, importMode === m && styles.modeChipTextSelected]}>
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

                {/* Select all toggle */}
                <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll}>
                  <View style={[styles.checkbox, selectedCatIds.size === sourceCategories.length && styles.checkboxChecked]}>
                    {selectedCatIds.size === sourceCategories.length && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                  <Text style={styles.selectAllText}>Select all</Text>
                </TouchableOpacity>

                {/* Category list */}
                {loadingSource ? (
                  <View style={styles.importLoading}>
                    <ActivityIndicator />
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

                <TouchableOpacity
                  style={[styles.button, (selectedCatIds.size === 0 || importing) && styles.buttonDisabled]}
                  onPress={handleImport}
                  disabled={selectedCatIds.size === 0 || importing}
                >
                  {importing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>
                      Import ({selectedCatIds.size} {selectedCatIds.size === 1 ? 'category' : 'categories'})
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={closeImport}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 16, gap: 12, paddingBottom: 80 },
  section: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
  },
  categoryName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#333', textTransform: 'uppercase', letterSpacing: 0.5 },
  catMoreBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  catMoreBtnText: { fontSize: 16, color: '#bbb', letterSpacing: 2 },
  addProductBtn: { paddingVertical: 4, paddingLeft: 4 },
  addProductText: { fontSize: 13, fontWeight: '600', color: '#555' },
  noProducts: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: '#aaa' },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  productName: { flex: 1, fontSize: 16, color: '#111' },
  productMeta: { fontSize: 14, color: '#888' },
  empty: { fontSize: 16, color: '#666', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#aaa', marginBottom: 24 },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { fontSize: 15, fontWeight: '600', color: '#111' },

  // Import entry points
  importEmptyBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  importEmptyBtnText: { fontSize: 15, color: '#555', fontWeight: '500' },
  importFooterBtn: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#ececec',
    backgroundColor: '#fff',
  },
  importFooterBtnText: { fontSize: 15, color: '#555', fontWeight: '500' },

  // Shared modal
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 40,
  },
  sheetScroll: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%' },
  sheetScrollContent: { padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: '#555', marginBottom: 6, marginTop: 4 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  unitsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 14, color: '#444' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  button: {
    height: 52,
    backgroundColor: '#111',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: '#888', fontSize: 15 },

  // Import modal specific
  importSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  importList: { maxHeight: 280, marginBottom: 8 },
  importLoading: { height: 80, alignItems: 'center', justifyContent: 'center' },
  importLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  importLocationInfo: { flex: 1 },
  importLocationName: { fontSize: 16, color: '#111' },
  importLocationMeta: { fontSize: 12, color: '#aaa', marginTop: 2 },
  importArrow: { fontSize: 20, color: '#bbb' },
  importSeparator: { height: 1, backgroundColor: '#f0f0f0' },
  importBackRow: { marginBottom: 16 },
  importBackText: { fontSize: 15, fontWeight: '600', color: '#555' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  modeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  modeChipSelected: { backgroundColor: '#111', borderColor: '#111' },
  modeChipText: { fontSize: 14, color: '#444' },
  modeChipTextSelected: { color: '#fff', fontWeight: '600' },
  replaceWarning: { fontSize: 12, color: '#c00', marginBottom: 12, marginTop: 4 },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectAllText: { fontSize: 15, fontWeight: '600', color: '#111', marginLeft: 10 },
  importCatList: { maxHeight: 220, marginBottom: 16 },
  importCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  importCatName: { flex: 1, fontSize: 15, color: '#111', marginLeft: 10 },
  importCatCount: { fontSize: 13, color: '#aaa' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: { backgroundColor: '#111', borderColor: '#111' },
  checkmark: { fontSize: 13, color: '#fff', fontWeight: '700' },
});
