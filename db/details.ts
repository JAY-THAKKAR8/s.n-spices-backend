// Demo detail-page content for seeded products.
// Plain kitchen facts only. No lab numbers or certificates: add those
// from admin only when the client has real test reports.

const keep = 'Keep in an airtight jar, away from sunlight and moisture. Use a dry spoon.';
const nuts = 'Keep in an airtight jar in a cool place. In summer, store in the fridge to keep them crisp.';

export const DETAILS: Record<string, Record<string, any>> = {
  'green-cardamom-8mm': {
    botanicalName: 'Elettaria cardamomum',
    grade: '8mm bold green pods',
    images: [
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBYbBjMTo1in0OrxSm-WjoGUJ6IGRx9OlG4DfC1O8xSpzv9FHPAdXwYK_P-DbR0C0CQe8D1rsVo8GnZRtObz4188GeGtX-S0PQDkDjqMrlZ8IZTxUT-fczOhWuNpOjiEQriG1A3Oj5SM1IdyMZWWSZsiTyhH-iBLrkRPDXxOUwBz1arTGY1x2mwRFBymxoNHy5QVe02f_r7sRXSDCWlu-rZHY9qDZmccJZiQh38GgUoe--eqX0zhuM',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDV8WEhXhWSF4lMyiZwqvn4xpkW2pms5QA6d4k6N2E2UlTXvOtcmSOH7tk457uYFR67EXTkcgWwM3Kz1unAWhiyUbFLDRdAnLhLx1Ub_lVZmmpWK8qKyKOSixdExYCiZJE_j6ye9QhhKunsnbnrGPe-KHjahgioPNuGhkz7uHWL5M_IGdm1be5kFz-CObtCuus82Vt5PRniieRTEY7LPnWsqLN76bLz17DFN6Or8QRxkXHuJs4lX5I',
    ],
    description:
      'Big, full green pods picked for size and colour. Each pod is packed with sticky black seeds that give a sweet, cool aroma. Good for chai, sweets, biryani and pulao.',
    tags: ['8mm bold pods', 'Full black seeds', 'No colour added', 'Strong aroma'],
    specs: [
      { label: 'Origin', value: 'Kerala' },
      { label: 'Pod size', value: '8mm and above' },
      { label: 'Form', value: 'Whole pods' },
      { label: 'Best before', value: '12 months from packing' },
    ],
    tasteNotes: [
      { label: 'Top note', text: 'Cool, fresh, a little minty', level: 85 },
      { label: 'Heart', text: 'Sweet and floral', level: 90 },
      { label: 'Finish', text: 'Warm and woody', level: 65 },
    ],
    uses: [
      { title: 'Masala Chai', text: 'Crush 2 pods and boil with water and ginger before adding tea leaves and milk.', tip: '2 pods per cup' },
      { title: 'Biryani & Pulao', text: 'Lightly crack pods and add to hot ghee for a few seconds before the rice.', tip: 'Do not let them burn' },
      { title: 'Sweets', text: 'Grind seeds with a little sugar and add to shrikhand, basundi or kheer at the end.', tip: 'Add after cooking' },
      { title: 'Mouth freshener', text: 'Chew one pod after meals.', tip: 'One pod is enough' },
    ],
    storage: keep,
  },
  'black-pepper-bold': {
    botanicalName: 'Piper nigrum',
    grade: 'Bold whole peppercorns',
    description: 'Bold, round black peppercorns with a sharp bite and woody smell. Grind fresh for the best taste.',
    tags: ['Bold berries', 'Sun-dried', 'Sharp heat'],
    specs: [
      { label: 'Origin', value: 'Kerala' },
      { label: 'Form', value: 'Whole' },
      { label: 'Best before', value: '18 months from packing' },
    ],
    tasteNotes: [
      { label: 'Heat', text: 'Sharp and strong', level: 85 },
      { label: 'Aroma', text: 'Woody, a little citrus', level: 70 },
    ],
    uses: [
      { title: 'Fresh grind', text: 'Grind over salads, eggs, soups and raita just before eating.', tip: 'Use a grinder' },
      { title: 'Kadha', text: 'Boil a few crushed peppercorns with tulsi, ginger and jaggery.', tip: '4–5 per cup' },
      { title: 'Garam masala', text: 'Dry roast with other whole spices and grind.', tip: 'Low flame' },
    ],
    storage: keep,
  },
  'kashmiri-saffron': {
    botanicalName: 'Crocus sativus',
    grade: 'Long red threads',
    description: 'Deep red saffron threads for colour and aroma. A few threads are enough for a whole dish.',
    tags: ['Red threads', 'Small pinch goes far', 'Gift pack'],
    specs: [
      { label: 'Origin', value: 'Kashmir' },
      { label: 'Form', value: 'Whole threads' },
      { label: 'Best before', value: '24 months from packing' },
    ],
    tasteNotes: [
      { label: 'Aroma', text: 'Honey-like, floral', level: 90 },
      { label: 'Colour', text: 'Golden yellow in milk', level: 95 },
    ],
    uses: [
      { title: 'Kesar milk', text: 'Soak 4–5 threads in warm milk for 10 minutes, then add to the rest.', tip: 'Soak first' },
      { title: 'Sweets', text: 'Add soaked saffron to shrikhand, peda and halwa.', tip: 'Add at the end' },
      { title: 'Biryani', text: 'Drizzle saffron milk over the top layer of rice before dum.', tip: 'Do not fry' },
    ],
    storage: 'Keep in the box away from light and heat. Close the lid tight after use.',
  },
  'cumin-seeds': {
    botanicalName: 'Cuminum cyminum',
    grade: 'Machine cleaned seeds',
    description: 'Clean, long cumin seeds with no dust or stones. The base of daily Gujarati tadka.',
    tags: ['Machine cleaned', 'No dust', 'Daily use'],
    specs: [
      { label: 'Origin', value: 'Gujarat' },
      { label: 'Form', value: 'Whole seeds' },
      { label: 'Best before', value: '12 months from packing' },
    ],
    tasteNotes: [
      { label: 'Aroma', text: 'Warm and earthy', level: 85 },
      { label: 'Taste', text: 'Nutty when roasted', level: 75 },
    ],
    uses: [
      { title: 'Tadka', text: 'Add to hot oil or ghee until they crackle, then add the rest.', tip: 'Few seconds only' },
      { title: 'Jeera rice', text: 'Fry seeds in ghee and cook with rice.', tip: '1 tsp per cup rice' },
      { title: 'Roasted jeera powder', text: 'Dry roast and grind for buttermilk, raita and chaat.', tip: 'Roast till dark' },
    ],
    storage: keep,
  },
  'turmeric-powder': {
    botanicalName: 'Curcuma longa',
    grade: 'Fine ground powder',
    description: 'Bright yellow turmeric powder with no added colour. Used in almost every dal and sabzi.',
    tags: ['No added colour', 'Fine grind', 'Daily use'],
    specs: [
      { label: 'Origin', value: 'Tamil Nadu' },
      { label: 'Form', value: 'Powder' },
      { label: 'Best before', value: '12 months from packing' },
    ],
    tasteNotes: [
      { label: 'Aroma', text: 'Earthy and warm', level: 80 },
      { label: 'Colour', text: 'Deep yellow', level: 90 },
    ],
    uses: [
      { title: 'Dal & Kadhi', text: 'Add with water while boiling dal.', tip: '¼ tsp per bowl' },
      { title: 'Sabzi', text: 'Add to oil after tadka for a few seconds, then add vegetables.', tip: 'Do not burn' },
      { title: 'Haldi doodh', text: 'Mix a pinch in warm milk with a little black pepper.', tip: 'A pinch is enough' },
    ],
    storage: keep,
  },
  'biryani-spice-kit': {
    grade: '12 whole spices, measured',
    tags: ['Ready ratios', '12 spices', 'Up to 8 meals'],
    specs: [
      { label: 'Contains', value: 'Javitri, shahi jeera, stone flower, star anise, cinnamon, cloves, cardamom and more' },
      { label: 'Form', value: 'Whole spices in packets' },
      { label: 'Best before', value: '12 months from packing' },
    ],
    uses: [
      { title: 'Biryani', text: 'Fry one packet in ghee before adding onions. Follow the card in the box.', tip: '1 packet per 1kg rice' },
      { title: 'Pulao', text: 'Use half a packet for vegetable pulao.', tip: 'Half packet' },
    ],
    storage: keep,
  },
  'w240-cashews': {
    botanicalName: 'Anacardium occidentale',
    grade: 'W240 whole',
    description: 'Big whole white cashews, about 240 per pound. Creamy and crunchy. No salt, not roasted.',
    tags: ['Whole kernels', 'No salt', 'Not roasted'],
    specs: [
      { label: 'Origin', value: 'Karnataka' },
      { label: 'Grade', value: 'W240 (about 240 nuts per pound)' },
      { label: 'Best before', value: '6 months from packing' },
    ],
    tasteNotes: [{ label: 'Taste', text: 'Creamy, mild sweet', level: 85 }],
    uses: [
      { title: 'Kaju katli', text: 'Grind to powder in short bursts and cook with sugar syrup.', tip: 'Do not over grind' },
      { title: 'Gravy', text: 'Soak and grind to a paste for rich curries.', tip: 'Soak 20 min' },
      { title: 'Snack', text: 'Eat as is or roast with a little ghee and salt.', tip: '' },
    ],
    storage: nuts,
  },
  'mamra-almonds': {
    botanicalName: 'Prunus dulcis',
    grade: 'Mamra, unpolished',
    description: 'Small, curved, oil-rich almonds with a strong nutty taste. Good soaked overnight.',
    tags: ['Unpolished', 'Oil rich', 'Crunchy'],
    specs: [
      { label: 'Origin', value: 'Imported' },
      { label: 'Form', value: 'Whole' },
      { label: 'Best before', value: '6 months from packing' },
    ],
    tasteNotes: [{ label: 'Taste', text: 'Rich and nutty', level: 90 }],
    uses: [
      { title: 'Soaked almonds', text: 'Soak 5–6 overnight, peel and eat in the morning.', tip: '5–6 a day' },
      { title: 'Badam milk', text: 'Grind soaked almonds with milk, sugar and cardamom.', tip: '' },
    ],
    storage: nuts,
  },
};
