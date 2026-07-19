// Grocery categories and items matching the HTML reference
// Used by both GroceryReminder and ListToBuy screens

export const GROCERY_CATEGORIES = [
  {
    id: 'vegetables',
    label: 'Vegetables',
    icon: 'leaf',
    color: '#2E9E5B',
    items: [
      'Tomato', 'Potato', 'Onion', 'Garlic', 'Ginger', 'Carrot', 'Spinach',
      'Cabbage', 'Cauliflower', 'Broccoli', 'Bell Pepper', 'Green Chili',
      'Cucumber', 'Zucchini', 'Eggplant', 'Peas', 'Corn', 'Beetroot',
      'Radish', 'Pumpkin', 'Bottle Gourd', 'Bitter Gourd', 'Lady Finger (Okra)',
      'French Beans', 'Spring Onion', 'Mushroom', 'Asparagus', 'Artichoke',
    ],
    defaultExpiryDays: 5,
  },
  {
    id: 'fruits',
    label: 'Fruits',
    icon: 'nutrition',
    color: '#F59E0B',
    items: [
      'Apple', 'Banana', 'Orange', 'Mango', 'Grapes', 'Watermelon',
      'Papaya', 'Pineapple', 'Strawberry', 'Blueberry', 'Raspberry',
      'Kiwi', 'Pomegranate', 'Lemon', 'Lime', 'Coconut', 'Avocado',
      'Peach', 'Plum', 'Pear', 'Cherry', 'Fig', 'Guava', 'Lychee',
      'Dragon Fruit', 'Passion Fruit', 'Jackfruit', 'Sapota (Chiku)',
    ],
    defaultExpiryDays: 7,
  },
  {
    id: 'pulses',
    label: 'Pulses & Legumes',
    icon: 'ellipse',
    color: '#D97706',
    items: [
      'Lentils (Red Dal)', 'Lentils (Green Dal)', 'Chickpeas (Chana)',
      'Black-eyed Peas (Lobia)', 'Kidney Beans (Rajma)', 'Moong Dal',
      'Urad Dal', 'Chana Dal', 'Masoor Dal', 'Toor Dal (Arhar)',
      'Soybean', 'Green Peas (Dried)', 'Black Chickpeas',
      'Horse Gram (Kulthi)', 'Moth Beans',
    ],
    defaultExpiryDays: 365,
  },
  {
    id: 'dairy',
    label: 'Dairy & Eggs',
    icon: 'water',
    color: '#60A5FA',
    items: [
      'Milk', 'Butter', 'Cheese', 'Paneer', 'Yogurt (Curd)', 'Cream',
      'Ghee', 'Condensed Milk', 'Buttermilk', 'Sour Cream', 'Cream Cheese',
      'Mozzarella', 'Parmesan', 'Cheddar', 'Eggs', 'Egg Whites',
    ],
    defaultExpiryDays: 7,
  },
  {
    id: 'meat',
    label: 'Meat & Seafood',
    icon: 'fish',
    color: '#EF4444',
    items: [
      'Chicken (Whole)', 'Chicken Breast', 'Chicken Thighs', 'Chicken Wings',
      'Mutton / Lamb', 'Beef', 'Pork', 'Turkey', 'Duck',
      'Fish (Salmon)', 'Fish (Tuna)', 'Fish (Tilapia)', 'Fish (Rohu)',
      'Prawns / Shrimp', 'Crab', 'Lobster', 'Squid', 'Mussels',
      'Salami', 'Sausages', 'Bacon',
    ],
    defaultExpiryDays: 3,
  },
  {
    id: 'grains',
    label: 'Grains & Cereals',
    icon: 'layers',
    color: '#92400E',
    items: [
      'Rice (Basmati)', 'Rice (Brown)', 'Wheat Flour (Atta)', 'All-Purpose Flour (Maida)',
      'Semolina (Suji/Rava)', 'Oats', 'Quinoa', 'Corn Flour', 'Barley',
      'Millet (Bajra)', 'Sorghum (Jowar)', 'Ragi (Finger Millet)',
      'Poha (Flattened Rice)', 'Vermicelli', 'Pasta', 'Noodles',
      'Bread Crumbs', 'Cornstarch',
    ],
    defaultExpiryDays: 180,
  },
  {
    id: 'bakery',
    label: 'Bakery & Bread',
    icon: 'cube',
    color: '#B45309',
    items: [
      'White Bread', 'Whole Wheat Bread', 'Sourdough Bread', 'Multigrain Bread',
      'Baguette', 'Pita Bread', 'Tortilla / Roti', 'Naan', 'Croissant',
      'Muffins', 'Bagel', 'Dinner Rolls', 'Cake', 'Cookies / Biscuits',
      'Donuts', 'Pancake Mix', 'Waffles', 'Rusk / Zwieback',
    ],
    defaultExpiryDays: 5,
  },
  {
    id: 'spices',
    label: 'Spices & Condiments',
    icon: 'color-palette',
    color: '#DC2626',
    items: [
      'Salt', 'Black Pepper', 'Red Chili Powder', 'Turmeric (Haldi)',
      'Cumin (Jeera)', 'Coriander Powder', 'Garam Masala', 'Cardamom (Elaichi)',
      'Cinnamon', 'Cloves', 'Bay Leaves', 'Mustard Seeds', 'Fenugreek (Methi)',
      'Asafoetida (Hing)', 'Dried Mango Powder (Amchur)', 'Curry Leaves',
      'Saffron', 'Nutmeg', 'Paprika', 'Oregano', 'Thyme', 'Rosemary',
      'Ketchup', 'Mustard Sauce', 'Mayonnaise', 'Soy Sauce', 'Hot Sauce',
      'Vinegar', 'Worcestershire Sauce', 'Oyster Sauce', 'Fish Sauce',
      'Olive Oil', 'Coconut Oil', 'Sunflower Oil', 'Sesame Oil',
      'Sugar', 'Brown Sugar', 'Honey', 'Jaggery', 'Maple Syrup',
    ],
    defaultExpiryDays: 365,
  },
  {
    id: 'beverages',
    label: 'Beverages',
    icon: 'cafe',
    color: '#7C3AED',
    items: [
      'Water (Bottles)', 'Mineral Water', 'Tea Bags', 'Green Tea', 'Coffee (Ground)',
      'Coffee (Instant)', 'Orange Juice', 'Apple Juice', 'Mango Juice', 'Mixed Fruit Juice',
      'Coconut Water', 'Soda / Cola', 'Energy Drinks', 'Sports Drinks',
      'Milk (UHT/Tetra Pack)', 'Almond Milk', 'Soy Milk', 'Oat Milk',
      'Hot Chocolate / Cocoa', 'Lemonade Mix', 'Smoothie Mix',
    ],
    defaultExpiryDays: 30,
  },
  {
    id: 'frozen',
    label: 'Frozen Foods',
    icon: 'snow',
    color: '#0EA5E9',
    items: [
      'Frozen Peas', 'Frozen Corn', 'Frozen Mixed Vegetables',
      'Frozen French Fries', 'Frozen Pizza', 'Frozen Burger Patties',
      'Frozen Chicken Nuggets', 'Frozen Fish Fillets', 'Frozen Prawns',
      'Ice Cream', 'Frozen Yogurt', 'Frozen Paratha / Roti',
      'Frozen Samosa', 'Frozen Spring Rolls', 'Frozen Momos',
    ],
    defaultExpiryDays: 90,
  },
  {
    id: 'snacks',
    label: 'Snacks & Packaged',
    icon: 'fast-food',
    color: '#F97316',
    items: [
      'Chips / Crisps', 'Popcorn', 'Namkeen / Mixture', 'Nuts (Mixed)',
      'Almonds', 'Cashews', 'Peanuts', 'Walnuts', 'Pistachios',
      'Granola Bars', 'Protein Bars', 'Rice Cakes',
      'Chocolate', 'Candy', 'Chewing Gum',
      'Instant Noodles', 'Instant Soup', 'Canned Tomatoes', 'Canned Beans',
      'Canned Corn', 'Canned Tuna', 'Canned Coconut Milk',
      'Jam / Jelly', 'Peanut Butter', 'Nutella',
      'Crackers', 'Poha Mix', 'Upma Mix',
    ],
    defaultExpiryDays: 90,
  },
];

// Helper: get all items flat with their category
export function getAllGroceryItems() {
  return GROCERY_CATEGORIES.flatMap((cat) =>
    cat.items.map((item) => ({
      name: item,
      categoryId: cat.id,
      categoryLabel: cat.label,
      categoryColor: cat.color,
      defaultExpiryDays: cat.defaultExpiryDays,
    }))
  );
}

// Helper: find which category an item belongs to
export function findItemCategory(itemName) {
  for (const cat of GROCERY_CATEGORIES) {
    const found = cat.items.find(
      (i) => i.toLowerCase() === itemName.toLowerCase()
    );
    if (found) return cat;
  }
  return null;
}

// Helper: get category by id
export function getGroceryCategory(categoryId) {
  return GROCERY_CATEGORIES.find((c) => c.id === categoryId) || null;
}
