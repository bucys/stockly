import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCompanyId } from '@/lib/useCompanyId';
import { useLocationAccessGuard } from '@/lib/useLocationAccess';
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
import { theme, shadows } from '@/constants/theme';
import { normalizeCategoryName } from '@/lib/normalizeCategoryName';
import { normalizeProductName } from '@/lib/normalizeProductName';
import { parseImportText, type ParsedImportRow } from '@/lib/parseImportText';
import { parseImportCsv } from '@/lib/parseImportCsv';
import { parseImportXlsx } from '@/lib/parseImportXlsx';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImportReviewSheet } from '@/components/inventory/ImportReviewSheet';
import { CategorySection } from '@/components/inventory/CategorySection';
import { RenameCategorySheet } from '@/components/inventory/RenameCategorySheet';
import { ProductEditorSheet } from '@/components/inventory/ProductEditorSheet';
import { ImportOptionsSheet } from '@/components/inventory/ImportOptionsSheet';
import { ImportFileSheet } from '@/components/inventory/ImportFileSheet';
import { PasteImportSheet } from '@/components/inventory/PasteImportSheet';
import { CopyFromLocationSheet } from '@/components/inventory/CopyFromLocationSheet';
import { commitImportPlan } from '@/services/importProducts';
import type { ImportPlan } from '@/lib/importMatchers';

const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'box', 'bottle', 'pack', 'bag', 'roll', 'm'];

interface EditingProduct extends ProductRow {
  categoryId: string;
}

type ImportStep = 'select-location' | 'select-categories' | null;

export default function LocationDetailScreen() {
  const { locationId, name } = useLocalSearchParams<{ locationId: string; name: string }>();
  const { companyId, role } = useCompanyId();
  const insets = useSafeAreaInsets();
  useLocationAccessGuard(locationId);

  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedCatIds, setCollapsedCatIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Category rename modal (kept for admin housekeeping via long-press)
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<{ id: string; name: string } | null>(null);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  // Product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null);
  const [productCategoryText, setProductCategoryText] = useState('');
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

  // Import entry menu
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showCsvSheet, setShowCsvSheet] = useState(false);
  const [pickingCsv, setPickingCsv] = useState(false);

  // Paste-text import flow
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [committing, setCommitting] = useState(false);

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

  // Default: collapse all categories. Preserve user expansions across reloads.
  useEffect(() => {
    setCollapsedCatIds((prev) => {
      if (prev.size > 0) return prev;
      return new Set(categories.map((c) => c.id));
    });
  }, [categories]);

  function toggleCategory(id: string) {
    setCollapsedCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Category rename/delete (long-press only) ─────────────────────────────────

  function openEditCategory(cat: { id: string; name: string }) {
    setEditingCat(cat);
    setCatName(cat.name);
    setShowCatModal(true);
  }

  async function handleSaveCategory() {
    if (!catName.trim() || !editingCat) return;
    setCatSaving(true);
    try {
      await updateCategory(editingCat.id, catName.trim());
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

  function openCreateProduct(prefillCategoryName?: string) {
    setEditingProduct(null);
    setProductCategoryText(prefillCategoryName ?? '');
    setProductName('');
    setProductUnit('pcs');
    setProductLastQty('');
    setShowProductModal(true);
  }

  function openEditProduct(product: ProductRow, categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    setEditingProduct({ ...product, categoryId });
    setProductCategoryText(cat?.name ?? '');
    setProductName(product.name);
    setProductUnit(product.unit);
    setProductLastQty(product.last_known_quantity != null ? String(product.last_known_quantity) : '');
    setShowProductModal(true);
  }

  async function resolveCategoryId(rawText: string): Promise<string | null> {
    if (!locationId) return null;
    const trimmed = rawText.trim();
    if (!trimmed) return null;
    const norm = normalizeCategoryName(trimmed);
    const existing = categories.find((c) => normalizeCategoryName(c.name) === norm);
    if (existing) return existing.id;
    try {
      const created = await createCategory(locationId, trimmed);
      return (created as { id: string }).id;
    } catch (err) {
      console.error('[resolveCategoryId] createCategory failed:', err);
      throw err;
    }
  }

  async function handleSaveProduct() {
    if (!productName.trim() || !productCategoryText.trim()) return;
    setProductSaving(true);
    const lastQty = productLastQty ? parseFloat(productLastQty) : undefined;
    try {
      const categoryId = await resolveCategoryId(productCategoryText);
      if (!categoryId) {
        Alert.alert('Error', 'Could not resolve category.');
        return;
      }

      const newNorm = normalizeProductName(productName);
      const matches: { name: string; categoryId: string; unit: string }[] = [];
      for (const cat of categories) {
        for (const p of cat.products) {
          if (editingProduct && p.id === editingProduct.id) continue;
          if (normalizeProductName(p.name) === newNorm) {
            matches.push({ name: p.name, categoryId: cat.id, unit: p.unit });
          }
        }
      }
      const exact = matches.find((m) => m.categoryId === categoryId && m.unit === productUnit);
      if (exact) {
        Alert.alert(
          'Duplicate product',
          `"${exact.name}" already exists in this category with unit "${exact.unit}".`,
        );
        return;
      }
      if (matches.length > 0) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Possible duplicate',
            `A product named "${matches[0].name}" already exists elsewhere. Save anyway?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Save anyway', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!proceed) return;
      }

      if (editingProduct) {
        await updateProduct(editingProduct.id, productName.trim(), productUnit, lastQty, categoryId);
      } else {
        await createProduct(categoryId, productName.trim(), productUnit, lastQty);
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

  // ── Category suggestions for product modal ──────────────────────────────────

  const categorySuggestions = useMemo(() => {
    const q = normalizeCategoryName(productCategoryText);
    if (!q) {
      return categories.slice(0, 6).map((c) => c.name);
    }
    const exact = categories.some((c) => normalizeCategoryName(c.name) === q);
    if (exact) return [];
    return categories
      .filter((c) => normalizeCategoryName(c.name).includes(q))
      .map((c) => c.name)
      .slice(0, 6);
  }, [productCategoryText, categories]);

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
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
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

  // ── Paste-text import ────────────────────────────────────────────────────────

  function openPasteImport() {
    setPasteText('');
    setParsedRows([]);
    setShowPasteModal(true);
  }

  function closePasteImport() {
    setShowPasteModal(false);
    setPasteText('');
  }

  function handleParse() {
    const result = parseImportText(pasteText);
    if (result.rows.length === 0) {
      Alert.alert('Nothing to import', 'No rows found. Use one product per line:\nname, category, unit, qty?');
      return;
    }
    setParsedRows(result.rows);
    setShowPasteModal(false);
    setShowReview(true);
  }

  function fileKindFromAsset(
    asset: { name?: string | null; mimeType?: string | null },
  ): 'csv' | 'xlsx' | 'pdf' | 'unknown' {
    const name = (asset.name ?? '').toLowerCase();
    const mime = (asset.mimeType ?? '').toLowerCase();
    if (name.endsWith('.csv') || mime === 'text/csv' || mime === 'text/comma-separated-values') {
      return 'csv';
    }
    if (
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel'
    ) {
      return 'xlsx';
    }
    if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
    return 'unknown';
  }

  async function chooseCsvFile() {
    if (pickingCsv) return;
    setPickingCsv(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Import failed', 'Could not read file.');
        return;
      }
      if (fileKindFromAsset(asset) !== 'csv') {
        Alert.alert('Wrong file type', 'Please choose a CSV file.');
        return;
      }
      let text: string;
      try {
        text = await new File(asset.uri).text();
      } catch (err) {
        console.warn('[chooseCsvFile] read error:', err);
        Alert.alert(
          'Import failed',
          "We couldn't read this file. Please check the file type and try again.",
        );
        return;
      }
      let result;
      try {
        result = parseImportCsv(text);
      } catch (err) {
        console.warn('[chooseCsvFile] parse error:', err);
        Alert.alert(
          'Import failed',
          "We couldn't read this file. Please check the file type and try again.",
        );
        return;
      }
      if (result.rows.length === 0) {
        Alert.alert(
          'Nothing to import',
          'No rows found in the CSV. Expected columns: name, category, unit, qty (optional).',
        );
        return;
      }
      setParsedRows(result.rows);
      setShowCsvSheet(false);
      setShowReview(true);
    } catch (err) {
      console.warn('[chooseCsvFile] unexpected:', err);
      Alert.alert(
        'Import failed',
        "We couldn't read this file. Please check the file type and try again.",
      );
    } finally {
      setPickingCsv(false);
    }
  }

  async function chooseXlsxFile() {
    if (pickingCsv) return;
    setPickingCsv(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Import failed', 'Could not read file.');
        return;
      }
      if (fileKindFromAsset(asset) !== 'xlsx') {
        Alert.alert('Wrong file type', 'Please choose an Excel file.');
        return;
      }
      let base64: string;
      try {
        base64 = await new File(asset.uri).base64();
      } catch (err) {
        console.warn('[chooseXlsxFile] read error:', err);
        Alert.alert(
          'Import failed',
          "We couldn't read this file. Please check the file type and try again.",
        );
        return;
      }
      let result;
      try {
        result = parseImportXlsx(base64);
      } catch (err) {
        console.warn('[chooseXlsxFile] parse error:', err);
        Alert.alert(
          'Import failed',
          "We couldn't read this file. Please check the file type and try again.",
        );
        return;
      }
      if (result.rows.length === 0) {
        Alert.alert(
          'Nothing to import',
          'No rows found in the spreadsheet. Expected columns: name, category, unit, qty (optional).',
        );
        return;
      }
      setParsedRows(result.rows);
      setShowCsvSheet(false);
      setShowReview(true);
    } catch (err) {
      console.warn('[chooseXlsxFile] unexpected:', err);
      Alert.alert(
        'Import failed',
        "We couldn't read this file. Please check the file type and try again.",
      );
    } finally {
      setPickingCsv(false);
    }
  }

  async function handleConfirmImport(plan: ImportPlan) {
    if (!locationId) return;
    setCommitting(true);
    try {
      const result = await commitImportPlan(plan, locationId);
      setShowReview(false);
      setParsedRows([]);
      setPasteText('');
      const failedCount = result.failed.length;
      const message =
        `Imported ${result.productsCreated} product${result.productsCreated === 1 ? '' : 's'}` +
        (result.categoriesCreated > 0
          ? ` in ${result.categoriesCreated} new categor${result.categoriesCreated === 1 ? 'y' : 'ies'}`
          : '') +
        `. ${result.skipped} skipped` +
        (failedCount > 0 ? `, ${failedCount} failed.` : '.');
      Alert.alert('Import complete', message);
      load();
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCommitting(false);
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

  // Hide categories without products (per spec) but keep them in `categories`
  // for category-suggestion matching and the rename/delete menu.
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.products.length > 0),
    [categories],
  );

  const searchActive = search.trim() !== '';
  const filteredCategories = useMemo(() => {
    if (!searchActive) return visibleCategories;
    const qProd = normalizeProductName(search);
    const qCat = normalizeCategoryName(search);
    return visibleCategories
      .map((cat) => {
        const catMatch = qCat !== '' && normalizeCategoryName(cat.name).includes(qCat);
        const data = cat.products.filter((p) =>
          catMatch || (qProd !== '' && normalizeProductName(p.name).includes(qProd)),
        );
        return { ...cat, products: data };
      })
      .filter((cat) => cat.products.length > 0);
  }, [visibleCategories, search, searchActive]);

  const isEmpty = !loading && visibleCategories.length === 0;
  const noSearchResults = !loading && !isEmpty && searchActive && filteredCategories.length === 0;


  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: name ?? 'Location',
          headerBackTitle: 'Back',
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : isEmpty ? (
        <View style={[styles.center, { paddingBottom: 160 + insets.bottom }]}>
          <Text style={styles.emptyTitle}>No products yet</Text>
          <Text style={styles.emptySub}>
            {role === 'admin'
              ? 'Add your first product or import products to get started.'
              : 'No products set up yet.'}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.toolbar}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
              placeholderTextColor={theme.colors.textPlaceholder}
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              role === 'admin' && { paddingBottom: 160 + insets.bottom },
            ]}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {noSearchResults && (
              <View style={styles.noResults}>
                <Text style={styles.noResultsTitle}>No products found</Text>
                <Text style={styles.noResultsSub}>Try a different search term.</Text>
              </View>
            )}
            {filteredCategories.map((cat) => (
              <CategorySection
                key={cat.id}
                category={cat}
                collapsed={!searchActive && collapsedCatIds.has(cat.id)}
                isAdmin={role === 'admin'}
                onToggle={toggleCategory}
                onLongPress={handleCategoryActions}
                onProductPress={handleProductPress}
              />
            ))}

          </ScrollView>
        </>
      )}

      {!loading && role === 'admin' && (
        <>
          <TouchableOpacity
            style={[styles.fab, { bottom: 80 + insets.bottom }]}
            onPress={() => openCreateProduct()}
            activeOpacity={0.9}
          >
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.fabText}>Add product</Text>
          </TouchableOpacity>

          <View style={[styles.importBar, { paddingBottom: 12 + insets.bottom }]}>
            <TouchableOpacity
              style={styles.importBtn}
              onPress={() => setShowImportMenu(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="cloud-download-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.importBtnText}>Import</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Category rename sheet (admin housekeeping) ─────────────────────── */}
      <RenameCategorySheet
        visible={showCatModal}
        value={catName}
        saving={catSaving}
        onChangeText={setCatName}
        onSave={handleSaveCategory}
        onClose={() => setShowCatModal(false)}
      />

      {/* ── Product editor sheet ───────────────────────────────────────────── */}
      <ProductEditorSheet
        visible={showProductModal}
        isEditing={editingProduct !== null}
        name={productName}
        onChangeName={setProductName}
        categoryText={productCategoryText}
        onChangeCategoryText={setProductCategoryText}
        categorySuggestions={categorySuggestions}
        onSelectSuggestion={setProductCategoryText}
        showCreateHint={
          productCategoryText.trim() !== '' &&
          !categories.some(
            (c) => normalizeCategoryName(c.name) === normalizeCategoryName(productCategoryText),
          )
        }
        createHintName={productCategoryText.trim()}
        units={UNITS}
        unit={productUnit}
        onSelectUnit={setProductUnit}
        lastQty={productLastQty}
        onChangeLastQty={setProductLastQty}
        saving={productSaving}
        onSave={handleSaveProduct}
        onClose={() => setShowProductModal(false)}
      />

      {/* ── Copy-from-location import sheet ─────────────────────────────────── */}
      <CopyFromLocationSheet
        step={importStep}
        loadingSource={loadingSource}
        sourceLocations={sourceLocations}
        selectedSourceName={selectedSourceName}
        sourceCategories={sourceCategories}
        selectedCatIds={selectedCatIds}
        importMode={importMode}
        importing={importing}
        onSelectSource={handleSelectSource}
        onBack={() => setImportStep('select-location')}
        onSelectMode={setImportMode}
        onToggleCategory={toggleCategoryId}
        onToggleSelectAll={toggleSelectAll}
        onImport={handleImport}
        onClose={closeImport}
      />

      {/* ── Import options menu ───────────────────────────────────────────── */}
      <ImportOptionsSheet
        visible={showImportMenu}
        onClose={() => setShowImportMenu(false)}
        onCopyFromLocation={() => {
          setShowImportMenu(false);
          openImport();
        }}
        onImportFromText={() => {
          setShowImportMenu(false);
          openPasteImport();
        }}
        onImportFromFile={() => {
          setShowImportMenu(false);
          setShowCsvSheet(true);
        }}
      />

      {/* ── Import File sheet ─────────────────────────────────────────────── */}
      <ImportFileSheet
        visible={showCsvSheet}
        picking={pickingCsv}
        onChooseCsv={chooseCsvFile}
        onChooseXlsx={chooseXlsxFile}
        onClose={() => setShowCsvSheet(false)}
      />

      {/* ── Paste-text import sheet ───────────────────────────────────────── */}
      <PasteImportSheet
        visible={showPasteModal}
        value={pasteText}
        onChangeText={setPasteText}
        onParse={handleParse}
        onClose={closePasteImport}
      />

      {/* ── Review parsed rows ────────────────────────────────────────────── */}
      <ImportReviewSheet
        visible={showReview}
        onClose={() => {
          if (committing) return;
          setShowReview(false);
        }}
        parsedRows={parsedRows}
        categories={categories}
        onConfirm={handleConfirmImport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: theme.spacing.lg, gap: 14, paddingBottom: 88 },
  toolbar: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInput: {
    height: 42,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    fontSize: 15,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noResultsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  noResultsSub: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },

  // Empty state
  emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  emptySub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  importBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 12,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  importBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: theme.radius.pill,
    ...shadows.md,
  },
  fabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
});
