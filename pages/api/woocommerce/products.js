// pages/api/woocommerce/products.js
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306, // Poort apart instellen
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
export default async function handler(req, res) {
  try {
    // We queryen de database direct voor alle producten, hun prijzen, hun categorieën en hun thumbnail IDs
    const [rows] = await pool.query(`
      SELECT 
        p.ID, p.post_title,
        pm_price.meta_value as price,
        pm_image.meta_value as image_id,
        t.name as category_name
      FROM wp_posts p
      LEFT JOIN wp_postmeta pm_price ON p.ID = pm_price.post_id AND pm_price.meta_key = '_price'
      LEFT JOIN wp_postmeta pm_image ON p.ID = pm_image.post_id AND pm_image.meta_key = '_thumbnail_id'
      LEFT JOIN wp_term_relationships tr ON p.ID = tr.object_id
      LEFT JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id AND tt.taxonomy = 'product_cat'
      LEFT JOIN wp_terms t ON tt.term_id = t.term_id
      WHERE p.post_type = 'product' 
      AND p.post_status = 'publish'
      GROUP BY p.ID
    `);

    // Loop door de resultaten en haal de image URL op via de ID
    const products = await Promise.all(rows.map(async (row) => {
      let imageUrl = null;
      if (row.image_id) {
        const [imgRows] = await pool.query('SELECT guid FROM wp_posts WHERE ID = ?', [row.image_id]);
        if (imgRows.length > 0) imageUrl = imgRows[0].guid;
      }

      return {
        id: row.ID,
        product_id: row.ID,
        variation_id: 0,
        name: row.post_title,
        price: parseFloat(row.price) || 0,
        image: imageUrl,
        categoryName: row.category_name || 'Overig',
        type: 'simple',
        variations: []
      };
    }));

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Database Query Error:", error);
    res.status(500).json({ success: false, error: 'Database verbinding mislukt' });
  }
}