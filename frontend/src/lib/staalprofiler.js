/**
 * staalprofiler.js — de valsede profiler, FEM-blokkene kan vælge imellem.
 *
 * Samme profiler som i backend/steel_profiles.csv (Euronorm), som backend
 * slår tværsnittet op i. Står et profil i en model, men ikke her, viste
 * <select> stille det første på listen -- en HEA160 så ud som en IPE200.
 */
export const STEEL_SECTIONS = [
  'IPE80', 'IPE100', 'IPE120', 'IPE140', 'IPE160', 'IPE180', 'IPE200', 'IPE220', 'IPE240', 'IPE270', 'IPE300', 'IPE330', 'IPE360', 'IPE400', 'IPE450', 'IPE500', 'IPE550', 'IPE600',
  'HEA100', 'HEA120', 'HEA140', 'HEA160', 'HEA180', 'HEA200', 'HEA220', 'HEA240', 'HEA260', 'HEA280', 'HEA300', 'HEA320', 'HEA340', 'HEA360', 'HEA400', 'HEA450', 'HEA500', 'HEA550', 'HEA600', 'HEA650', 'HEA700', 'HEA800', 'HEA900', 'HEA1000',
  'HEB100', 'HEB120', 'HEB140', 'HEB160', 'HEB180', 'HEB200', 'HEB220', 'HEB240', 'HEB260', 'HEB280', 'HEB300', 'HEB320', 'HEB340', 'HEB360', 'HEB400',
]
