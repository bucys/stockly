import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, shadows } from '@/constants/theme';
import type { CategoryWithProducts, ProductRow } from '@/services/categories';

interface Props {
  category: CategoryWithProducts;
  collapsed: boolean;
  isAdmin: boolean;
  onToggle: (categoryId: string) => void;
  onLongPress: (category: { id: string; name: string }) => void;
  onProductPress: (product: ProductRow, categoryId: string) => void;
}

export function CategorySection({
  category,
  collapsed,
  isAdmin,
  onToggle,
  onLongPress,
  onProductPress,
}: Props) {
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.categoryRow}
        onPress={() => onToggle(category.id)}
        onLongPress={isAdmin ? () => onLongPress(category) : undefined}
        delayLongPress={400}
        activeOpacity={0.6}
      >
        <Text style={styles.categoryName}>{category.name.toUpperCase()}</Text>
        <Text style={styles.categoryCount}>
          {category.products.length} {category.products.length === 1 ? 'product' : 'products'}
        </Text>
        <Ionicons
          name={collapsed ? 'chevron-forward' : 'chevron-down'}
          size={14}
          color={theme.colors.textLight}
          style={styles.categoryChevron}
        />
      </TouchableOpacity>

      {!collapsed &&
        category.products.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={styles.productRow}
            onPress={() => onProductPress(product, category.id)}
            activeOpacity={0.7}
          >
            <View style={styles.productLeft}>
              <Text style={styles.productName} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.productUnit}>{product.unit}</Text>
            </View>
            {product.last_known_quantity != null ? (
              <Text style={styles.productQty}>
                {product.last_known_quantity}
                <Text style={styles.productQtyUnit}> {product.unit}</Text>
              </Text>
            ) : (
              <Text style={styles.productQtyEmpty}>—</Text>
            )}
          </TouchableOpacity>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingVertical: 11,
    backgroundColor: '#F2F2EF',
  },
  categoryName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
  },
  categoryCount: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  categoryChevron: {
    marginLeft: 8,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  productLeft: { flex: 1, paddingRight: 12 },
  productName: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  productUnit: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  productQty: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  productQtyUnit: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textLight,
  },
  productQtyEmpty: {
    fontSize: 16,
    color: theme.colors.textPlaceholder,
  },
});
