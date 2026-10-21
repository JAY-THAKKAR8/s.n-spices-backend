// Demo data: admin, categories, products, one coupon.
// Safe to run many times (skips rows that exist).
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, tx } from '../src/db.js';
import { DETAILS } from './details.js';

const IMG = 'https://lh3.googleusercontent.com/aida-public/';
// Images come from the design mockups. Swap with real product photos later.
const img = {
  wholeCat: IMG + 'AB6AXuAAQt6eym0SHydBmpHyfeo27B6BH4fCWik8UAij9UoyQSfq_4QZB7z4UjBu2FepScNNv3wGRTeNSPAW9LMZ_-3sXC2nG5fE7VHO521f2oUOFzcHK0Kty-1aIFFe0mtb_BOtbDSxXKyTcIl4cFeVkGu8_KQmlU8n25u8Fz4lr61xpiITejdrZlpG6a-pS8q1Af4SPvydlFNy78lSBxtxdoQ280WZ3RAw85tObjbK0aiOI9TWA8Eq4F0',
  groundCat: IMG + 'AB6AXuCFrOMgrQbQeRfLOLxdZse-npl3xLlAiJuPqSa27a55YtYZsByWWsdt8Tv-g2N5c8pdY0CMHOnej4wMnwelXyhFt4VBCpGRtpiXhToOZYAcWU4-aqG71GI0NjHIpw-iljInHt8d9HRJxPZIUS7sinY6JsU5BJ1U6LZuC9tH0eWRKb0a-X3w5qQzbl-G2TLm5UCb-PSviFHZsHe9qrY4vs23nfmQRpyukmLSfNtdLDQelw2PLPsaLLM',
  masalaCat: IMG + 'AB6AXuCq8ZHnJustbUXjHnaravlaeMTlihhKv9mCP5cQCRzpTzrMsMywbSSXwCKvmwRswiRTlXpSF5KPGdhEglpKQXseZuwTpoNh3uKFUt8W-iMJSPRfsuxvLYqX41esMrf4aDlO_A-OPYkcOAK8NTj8U-r5bNiX_2CcVDuFCXj1QN_B4XD3Qihed-ycAY3F1wR0FgIbhrzQKq3dBv9ub0Kx0IaxXpxclFQm1KVbLOT6jaAMegRp30o7-VQ',
  dryCat: IMG + 'AB6AXuB3Ls2Z6Hym_NRhZvQ-38V0XHGgIoFAWgLaYzF6vvp41YxeEmZCShHwDmX9ynuDOcnTTesATAliJ0F8mT15xSI-ePfvF0GNtJaOms7YPcNkv4Zv9mAYiz54-vjgwhizBla4vXxHZllRpW3kegjVcqqN2aZWB_36S6A9jbxc0amiiowPOpwd4U9ppDKmdZg3kFtJo2ak_uoiGg1lIXdDrBRqL-LR6tyJxLdJFvL_48M__ZcYFiaVcJM',
  seedsCat: IMG + 'AB6AXuAW2XAGsTAWNNAjhd3A3l6lXbZpIK5Akfu4miq-QpFgeugM6uV5ARoRLdOlnWhHG3nXrWKwHEPCLz6v2Su9hlzepkd591EqDgMEH19BqIkasRQshgrD3QeCA6tcjhF6NycPazvPIjlsachbXCuYT3jQPdlIz4fnzPjkrXuKYE1FMR2Hlj8fk1ie586aRtFcwGA6byKXi6YCLpnkn0IEgTQUOymWlK_lMWHUXdutMOAxZFkqvbaLYVc',
  bulkCat: IMG + 'AB6AXuABeaYA6M52NLTAQW6bAEnOr6AN5J_vg2gzv_PqzN8fmIh9-qmIGdRmW-7L9OZ10ITMCTKr0nO92vSgpIRHelNnRN_-quN76UmL6PTlMCLKAi6PmBKt0cGekvBD09OqgUQu6R2kvQR7OIgD-kY21u-lgjJ36XhOuyJ597uhCC8CFOf8M9C6Ctcq2I6y65ZR5E6i2DuMBM5C0xEa9J4btvbAQkuyzCJDHhgrJ-2ffOom6-w4ac_2K-E',
  cardamom: IMG + 'AB6AXuCbvzqT-DMTF1b005tLW7dO8ZK_N3o7yBNM1DO3y_iPirx48o2KVXIKQUPHmXfnL1B-GYJlhZreUwFQ95FVEC3r7btyHCVOGcrO9IN2WDNyg2XaywmwRsfLmDEzpOL-dUOKE_96SeypmJWM_YbWLYOm3s1wOj8FILJ3rfpfk-J9ULkVHOLKl5WJLoXATcO20gkhGv0B4ipz3u71e7UhYymiqxbfDmjh5WE0xMx9Zj9CNCA7N5gDRao',
  pepper: IMG + 'AB6AXuDrws_mmH6kZDbyNCSFdJLz-yTI5xmv7DfGH1cQBmK46p0a0tIUqbEltyKeVhywfMlFWaGI1ZzqQu_WqgTWlBtgvXtiIHcuARswi2JvbGsWAK9D_psH_KKsIdgjPQ2wu1B6rXx-Rgltkcln475R2FcRE1I0oZV5Qo-xpWRsZmay6OzMzPRjEhLR5MC7rt5lZkgnLWjQkI6nPuWjbzKLlfF_-LnXRoSyIaoFiIV6BLalAXvL1zL7tQc',
  saffron: IMG + 'AB6AXuC94qpFkA4bvhH6pU_SYcqMbYYSEPKZIjU1-qCb8opgtPRunkQAul8Bv56KlqaV_-1dHW0CMU6EKHQp3tfRRpdecE5pBqIyXkES5DfDWP_VZ6cAZS3n5iDBSYfwAvC10-d1ve4qj3ArNtoHm0lEWGlw-2D4m8IG47AJll0Eopm7qWyB0GUJuaTaeKBF0YSDIUnPAW5oi9PwPF7pJXhrYfOabBT7oLgLFArM8P_pCrdeQYMjl3yhigk',
  turmeric: IMG + 'AB6AXuBqj61Q-pFEypl1gTZo4RXmmk_6L7XUt_BcluKdBMuI-iq1VcuDwMl2qUxTQey-Nm-zcS2GxsbGcHCFh3ZnCQR1duewA6pq-Om-VLTcIGZs13P0PHEfAcOwrbG8n_UR_VOzi3lX4a47n6ln83Wbk3_4VMH6tYuwP58jvUfx0gWlTyTJxndUSVkN6rkYQmHtT6FE5IFHuv1REn85A5EOZCeTTNm4JIvJp14NR1I8FVYi5VvSQufWTsA',
  cashew: IMG + 'AB6AXuC3cMaNSAje0_1osfgAqyua4OdIN56XqgtWa925aupi3q4IsFeFuYU1Hgu6CZpGN2ARmYTFM6pjs2ZswtCVyuIjFZiob59cfzjAruAsJ_JvcrC2r6kDWrirpoER36Xr4_hlncG2GnIaGX9puczngJ2ZfZmJ4dn9KNGnyw-h_vZCxdbdMwS3Ktps4Kj--jpDEKv29RnP381qHINpqYFmp9_bn7pyEYQA3YX2f7j2bC_0NkTCtzXlw0A',
  almond: IMG + 'AB6AXuAfJejBrurfxy4WzuQEMHETGvTowDNM3W4RylW2xGta2XWfzPkhjnwpw74_TI9ElDoD5i6VnzLY53EBrm0KSG9JZa9nTcdxdyyZuqXD7cMS9-MffukFMCx1Vr7fqbha1l5_as8XFHfZk7xvUYmNdVCxpo5ai1y-1vYhua2vVj5gKt3GyPb5eXdOBPlnnyGH1q3-POHBG9Z1L-eXGetWVMePe47DzEeH-Q-TlIb3akyNIJ0tf8sYNxY',
  biryani: IMG + 'AB6AXuCJXxdeoSkZ_OeBYWIxmL12qaG1qGl8ua6P100pK63FzSxH_jACJoXSBLMGnS9M5Ewb9qI9i99t16FuJb95H0KLfhyr_UY47v3tVToQItb8CZc3X5ogxRhTaNRFWiEGAeUKEgR1pXFYpJPgfq1WlC53smWxeOJ2XdO8BqXn3WuJ5hoZMSR4NJQVsLTSjvaFcVP2xYVyfIyKZJmpr6tJSolloZAC5w14-nHNCo3cchjlRrkJgDcX_8k',
  chilli: IMG + 'AB6AXuA10WkugaY-zl-uahX7FzUzJQy8qW_-bxPFv9R9ErgcmfqsAE3DL7hCAI3yIuLrGhwzXDaXwL4z_F-VHJvi9Yv_vG_affMu90bhgGlWtNTAV6FhXLSZCZk89nw94a2fAX4V_X88yInUkjNWytlrzc14eZYurhlPguE1n_mT0ZFGiO9SdLXQfbzQHNM_P-deIWKZ1jhhMjw9wgcU-Vb-0ct4VkIup3mOMc1SPMYKmjwwD0YtMtqD9vE',
  starAnise: IMG + 'AB6AXuC8QPVGpyIoUoCegH0-Frj9u_08-npKrKG4_yfFDbTvq5uyAYYfC0SIERweOACreIYy28G6Hl0ms--_owDykgI5VALFe30CmkF5WF5Scip3tbp_3BlpEFUdCLrolss9R4Ukpn6-u7b_czJOYkzV0swQVNn-pFAeOhckGSfD-32MkwubdUagkGJ_Qj8ReHogi3-5gUF18kgMokIzZtk5HhulnKNWfbgodllUzN4Ek64A5RMS0MNtta8',
  jeera: IMG + 'AB6AXuB8MkQUc0f7cUqYcT7tU-_sugnCaCklyMJB1u_h6JfG-8nbUr0UjQRoGo6lvHvvrLEq90diCFgIKsK0VL-x4ZomZwQQA8zCCoQhNfq7v6gYTaiNeVtaYNYwWtOZRkMcVoNh0uC8QxcgB67ceadOLeibx99_70cRlyATA3_CZLcoky_-60cXp8F6Huxp7G9u1iMNxIkcnfH8LQBuSH8s--zxRo-3M-PaXanTKd-BDhKjJSCU5YWZyPA',
  cinnamon: IMG + 'AB6AXuAXx1g5iW0FJGLDuJ282uXBaQkQS5dcCbtOybMg_EAbzIXMpcPB_CEfIgAA4IDoKx6fdY_QwqDPqCQy522VRgLZ3qT4kh76iYsp1z84PjV2lwyzfe8ytgwPUrXg_juzzjWI2VS0iqA3KxG-bFtxx0Sch7Kx4ZvCHCTef55HrXeggsR6aAzGW5DrRIEzjSn8Td1ZmEvaV9d4n7bmBSLXlkv2Mg_Pm0DQw7TOLc6biOBVgvyO75OLCVU',
  cloves: IMG + 'AB6AXuArI5RWVl2ax6Oon6vD3lJFjtAOO05yl03p1LQqn0R4BrpfRva_k9SGwiEZTSHzK5bXa1sPfVg20K2AikrbbuZlP72GoYJxLdaCnM3U7cZu03FzqlRvksZ-dDbTG6v_aRVw2C_BiN0WlrnyfMPhxLziqZswivKNXj4XO0PC2ppy3KYtDfmv7fQWFJvBc3mrVDEnXsMV_bbjOb2s0oF3tTgWBeii9lojjjauS7aC2iUTLz455ZdsTKo',
  mace: IMG + 'AB6AXuDXkUQyY3QGocUOr7XNozPrlo5RJ3rDhHYyd6Upc22UiD2PSal_-Ygri1HMmcmSYjvjjvG31IdLZkys0YDVmGaoF9P6au3X4ZXtliOW1Y0mnnYBu2OS_RArVyF_YyVm5PA9RLhHYIF59OUxxsiYsOBO3JersqFk5eP9fgo45-7NiPEAwm42fGiDEbZyajW4r40zHQuAUZ6Pr80qqtSFAz_7oBuxJChH0DyBSEu3rVQ0t7V23syHQP4',
  shahiJeera: IMG + 'AB6AXuBt8Z09vgbLBGrmEVrSqEjje91brGuQDZkXpXEW0zPoqfvrbAopkCAJNQ6cyxcgyT8Nftmf28TM9q-SW3NeGx4hJBLzWcmxSbiq6iSv2ouSrCNwuH5k5XGg2SnFg48laYtNK2GDZGLu8ZTro1D29EU5VLnmxfxae61BpO5uwVpwJyZq2QzQB3S_wuYMidZ_1hUgRpkpbKGeIJTqOiW4Rb7At2-2-guSD2lFX2xabNZVU5wgo6f1WWI',
};

const categories = [
  ['whole-spices', 'Whole Spices', 'આખા મસાલા', 'साबुत मसाले', 'Cardamom, Clove, Star Anise', 'Pod & Bark', img.wholeCat],
  ['ground-masalas', 'Ground Masalas', 'પીસેલા મસાલા', 'पिसे मसाले', 'Turmeric, Degi Mirch, Dhania', 'Fresh Ground', img.groundCat],
  ['indian-masalas', 'Indian Masalas', 'ભારતીય મસાલા', 'भारतीय मसाले', 'Garam Masala, Biryani Mix', 'Master Blends', img.masalaCat],
  ['premium-dry-fruits', 'Premium Dry Fruits', 'સૂકો મેવો', 'सूखे मेवे', 'Almonds, Cashews, Raisins', 'Hand-Sorted', img.dryCat],
  ['seeds-and-herbs', 'Seeds & Herbs', 'બીજ અને જડીબુટ્ટી', 'बीज और जड़ी-बूटी', 'Flax, Chia, Mustard', 'Superfoods', img.seedsCat],
  ['wholesale-packs', 'Wholesale Packs', 'હોલસેલ પેક', 'होलसेल पैक', 'Bulk 1kg & 5kg Packs', 'Bulk Rates', img.bulkCat],
];

// variants: [packSize, grams, price, mrp]
const products = [
  { cat: 'whole-spices', slug: 'green-cardamom-8mm', en: 'Green Cardamom 8mm (Elaichi)', gu: 'લીલી એલચી 8mm', hi: 'हरी इलायची 8mm', hl: 'Strong aroma, bold pods', origin: 'Kerala', badge: 'Bestseller', image: img.cardamom, featured: true,
    v: [['100g', 100, 290, 340], ['250g', 250, 690, 800], ['500g', 500, 1320, 1600]] },
  { cat: 'whole-spices', slug: 'black-pepper-bold', en: 'Black Pepper Bold (Kali Mirch)', gu: 'કાળા મરી', hi: 'काली मिर्च', hl: 'Sun-dried whole peppercorns', origin: 'Kerala', badge: 'New Harvest', image: img.pepper, featured: true,
    v: [['200g', 200, 195, 230], ['500g', 500, 470, 560]] },
  { cat: 'whole-spices', slug: 'kashmiri-saffron', en: 'Kashmiri Saffron (Kesar)', gu: 'કાશ્મીરી કેસર', hi: 'कश्मीरी केसर', hl: 'Deep red threads', origin: 'Kashmir', badge: 'Premium', image: img.saffron, featured: true,
    v: [['1g', 1, 380, 450], ['2g', 2, 740, 880]] },
  { cat: 'whole-spices', slug: 'kashmiri-red-chilli', en: 'Kashmiri Whole Red Chilli', gu: 'કાશ્મીરી લાલ મરચું', hi: 'कश्मीरी लाल मिर्च', hl: 'Rich colour, mild heat', origin: 'Kashmir', badge: 'Mild Heat', image: img.chilli,
    v: [['250g', 250, 160, 190], ['500g', 500, 310, 370]] },
  { cat: 'whole-spices', slug: 'star-anise', en: 'Star Anise (Chakri Phool)', gu: 'બાદિયાન', hi: 'चक्री फूल', hl: 'Whole stars for biryani', origin: 'North East', badge: 'Whole Stars', image: img.starAnise,
    v: [['100g', 100, 120, 145], ['250g', 250, 290, 350]] },
  { cat: 'whole-spices', slug: 'cumin-seeds', en: 'Cumin Seeds (Jeera)', gu: 'જીરું', hi: 'जीरा', hl: 'Machine cleaned, no dust', origin: 'Gujarat', badge: 'Gujarat Pick', image: img.jeera, featured: true,
    v: [['250g', 250, 110, 130], ['500g', 500, 210, 250], ['1kg', 1000, 400, 480]] },
  { cat: 'whole-spices', slug: 'cinnamon-quills', en: 'Cinnamon Quills (Dalchini)', gu: 'તજ', hi: 'दालचीनी', hl: 'Thin layers, sweet note', origin: 'Sri Lanka', badge: 'True Bark', image: img.cinnamon,
    v: [['100g', 100, 240, 280]] },
  { cat: 'whole-spices', slug: 'whole-cloves', en: 'Whole Cloves (Laung)', gu: 'લવિંગ', hi: 'लौंग', hl: 'Full heads, strong oil', origin: 'Tamil Nadu', badge: 'Full Head', image: img.cloves,
    v: [['100g', 100, 185, 210], ['250g', 250, 450, 520]] },
  { cat: 'whole-spices', slug: 'mace-javitri', en: 'Mace Blades (Javitri)', gu: 'જાવંત્રી', hi: 'जावित्री', hl: 'For Mughlai dishes', origin: 'Kerala', badge: 'Premium', image: img.mace,
    v: [['50g', 50, 260, 310]] },
  { cat: 'whole-spices', slug: 'shahi-jeera', en: 'Shahi Jeera (Caraway)', gu: 'શાહી જીરું', hi: 'शाही जीरा', hl: 'Slender seeds for curries', origin: 'Kashmir', badge: 'Royal', image: img.shahiJeera,
    v: [['100g', 100, 140, 170]] },
  { cat: 'ground-masalas', slug: 'turmeric-powder', en: 'Turmeric Powder (Haldi)', gu: 'હળદર પાવડર', hi: 'हल्दी पाउडर', hl: 'Bright colour, no added colour', origin: 'Tamil Nadu', badge: 'Pure', image: img.turmeric, featured: true,
    v: [['250g', 250, 85, 105], ['500g', 500, 165, 200], ['1kg', 1000, 320, 390]] },
  { cat: 'indian-masalas', slug: 'biryani-spice-kit', en: 'Biryani Whole Spice Kit', gu: 'બિરયાની મસાલા કિટ', hi: 'बिरयानी मसाला किट', hl: '12 spices, pre-measured', origin: 'House Blend', badge: 'Combo', image: img.biryani, featured: true,
    desc: 'Javitri, Shahi Jeera, Stone Flower, Star Anise, Cinnamon and more in ready ratios. Serves up to 8 family meals.',
    v: [['1 Box', 0, 340, 420]] },
  { cat: 'premium-dry-fruits', slug: 'w240-cashews', en: 'W240 Cashews (Kaju)', gu: 'કાજુ W240', hi: 'काजू W240', hl: 'Big whole cashews', origin: 'Karnataka', badge: 'Hand-Sorted', image: img.cashew, featured: true,
    v: [['250g', 250, 250, 290], ['500g', 500, 480, 560], ['1kg', 1000, 940, 1100]] },
  { cat: 'premium-dry-fruits', slug: 'mamra-almonds', en: 'Mamra Almonds (Badam)', gu: 'મામરા બદામ', hi: 'ममरा बादाम', hl: 'Rich, unpolished', origin: 'Imported', badge: 'High Oil', image: img.almond, featured: true,
    v: [['250g', 250, 310, 360], ['500g', 500, 590, 680]] },
  { cat: 'wholesale-packs', slug: 'jeera-5kg-bulk', en: 'Cumin Seeds Bulk 5kg', gu: 'જીરું 5kg', hi: 'जीरा 5kg', hl: 'For shops & caterers', origin: 'Gujarat', badge: 'Bulk', image: img.jeera,
    v: [['5kg', 5000, 1850, 2400]] },
  { cat: 'wholesale-packs', slug: 'turmeric-5kg-bulk', en: 'Turmeric Powder Bulk 5kg', gu: 'હળદર 5kg', hi: 'हल्दी 5kg', hl: 'For shops & caterers', origin: 'Tamil Nadu', badge: 'Bulk', image: img.turmeric,
    v: [['5kg', 5000, 1450, 1900]] },
];

async function main() {
  await tx(async ({ q, one }) => {
    const email = (process.env.ADMIN_EMAIL || 'admin@snspices.in').toLowerCase();
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
    await q(`INSERT INTO admins (name, email, password) VALUES ('Store Admin', $1, $2) ON CONFLICT (email) DO NOTHING`, [email, hash]);

    const catId = {};
    for (const [i, c] of categories.entries()) {
      const row = await one(
        `INSERT INTO categories (slug, name_en, name_gu, name_hi, subtitle, tag, image, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (slug) DO UPDATE SET name_en = EXCLUDED.name_en
         RETURNING id`,
        [...c, i + 1],
      );
      catId[c[0]] = row.id;
    }

    for (const p of products) {
      const exists = await one('SELECT id FROM products WHERE slug = $1', [p.slug]);
      if (exists) continue;
      const row = await one(
        `INSERT INTO products (category_id, slug, name_en, name_gu, name_hi, description, highlight, origin, badge, image, is_featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [catId[p.cat], p.slug, p.en, p.gu, p.hi, p.desc || null, p.hl, p.origin, p.badge, p.image, !!p.featured],
      );
      for (const [packSize, grams, price, mrp] of p.v) {
        await q('INSERT INTO product_variants (product_id, pack_size, grams, price, mrp) VALUES ($1,$2,$3,$4,$5)', [row.id, packSize, grams, price, mrp]);
      }
    }

    // detail-page content (updates every run)
    for (const [slug, d] of Object.entries(DETAILS)) {
      await q(
        `UPDATE products SET botanical_name = $2, grade = $3, tags = $4, specs = $5, taste_notes = $6, uses = $7, storage = $8,
           description = COALESCE($9, description), images = $10
         WHERE slug = $1`,
        [slug, d.botanicalName || null, d.grade || null, JSON.stringify(d.tags || []), JSON.stringify(d.specs || []),
          JSON.stringify(d.tasteNotes || []), JSON.stringify(d.uses || []), d.storage || null, d.description || null,
          JSON.stringify(d.images || [])],
      );
    }

    await q(`INSERT INTO coupons (code, type, value, min_order, max_off) VALUES ('SPICE10','PERCENT',10,499,200) ON CONFLICT (code) DO NOTHING`);
  });
  console.log('Seed done.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
