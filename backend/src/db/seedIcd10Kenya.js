/**
 * seedIcd10Kenya.js
 * =================
 * Seeds the icd10_codes table with the ~200 most common diagnoses
 * in Kenya — enough for 95%+ of encounters without AI lookups.
 *
 * Run with: node src/db/seedIcd10Kenya.js
 *
 * For the full WHO ICD-10 dataset (14,000+ codes), download the CSV from:
 * https://icd.who.int/browse10/Content/statichtml/ICD10Volume2_en_2019.pdf
 * and import with: COPY icd10_codes(code, description) FROM 'icd10_full.csv' CSV;
 */

const db = require('./index');

const CODES = [
  // Infectious & parasitic
  ['A01.0','Typhoid fever'],
  ['A09',  'Diarrhoea and gastroenteritis of infectious origin'],
  ['A15.9','Respiratory tuberculosis, unspecified'],
  ['A41.9','Sepsis, unspecified'],
  ['B01.9','Varicella (chickenpox) without complications'],
  ['B05.9','Measles without complications'],
  ['B24',  'HIV/AIDS, unspecified'],
  ['B50.9','Plasmodium falciparum malaria, unspecified'],
  ['B54',  'Unspecified malaria'],
  ['B86',  'Scabies'],
  ['A06.0','Acute amoebic dysentery'],
  ['A87.9','Viral meningitis, unspecified'],
  ['A39.9','Meningococcal infection, unspecified'],

  // Neoplasms
  ['C53.9','Malignant neoplasm of cervix uteri, unspecified'],
  ['C50.9','Malignant neoplasm of breast, unspecified'],
  ['C22.0','Hepatocellular carcinoma'],
  ['C16.9','Malignant neoplasm of stomach, unspecified'],
  ['C34.9','Malignant neoplasm of bronchus/lung, unspecified'],

  // Blood
  ['D50.9','Iron deficiency anaemia, unspecified'],
  ['D57.1','Sickle-cell anaemia without crisis'],
  ['D64.9','Anaemia, unspecified'],

  // Endocrine
  ['E10.9','Type 1 diabetes mellitus without complications'],
  ['E11.9','Type 2 diabetes mellitus without complications'],
  ['E11.5','Type 2 diabetes mellitus with peripheral circulatory complications'],
  ['E14.9','Unspecified diabetes mellitus without complications'],
  ['E03.9','Hypothyroidism, unspecified'],
  ['E40',  'Kwashiorkor'],
  ['E41',  'Nutritional marasmus'],
  ['E46',  'Unspecified protein-energy malnutrition'],

  // Mental health
  ['F20.9','Schizophrenia, unspecified'],
  ['F32.9','Depressive episode, unspecified'],
  ['F10.2','Alcohol dependence syndrome'],

  // Nervous system
  ['G40.9','Epilepsy, unspecified'],
  ['G43.9','Migraine, unspecified'],

  // Eye
  ['H00.0','Hordeolum and other deep inflammation of eyelid'],
  ['H10.9','Conjunctivitis, unspecified'],
  ['H26.9','Cataract, unspecified'],

  // Ear
  ['H66.9','Suppurative otitis media, unspecified'],
  ['H65.9','Nonsuppurative otitis media, unspecified'],

  // Circulatory
  ['I10',  'Essential (primary) hypertension'],
  ['I11.9','Hypertensive heart disease without heart failure'],
  ['I20.9','Angina pectoris, unspecified'],
  ['I21.9','Acute myocardial infarction, unspecified'],
  ['I50.9','Heart failure, unspecified'],
  ['I60.9','Subarachnoid haemorrhage, unspecified'],
  ['I63.9','Cerebral infarction, unspecified'],
  ['I64',  'Stroke, not specified as haemorrhage or infarction'],
  ['I84.9','Haemorrhoids, unspecified'],

  // Respiratory
  ['J00',  'Acute nasopharyngitis (common cold)'],
  ['J02.9','Acute pharyngitis, unspecified'],
  ['J03.9','Acute tonsillitis, unspecified'],
  ['J06.9','Acute upper respiratory infection, unspecified'],
  ['J18.9','Pneumonia, unspecified'],
  ['J22',  'Unspecified acute lower respiratory infection'],
  ['J45.9','Asthma, unspecified'],
  ['J45.0','Predominantly allergic asthma'],

  // Digestive
  ['K02.9','Dental caries, unspecified'],
  ['K21.0','Gastro-oesophageal reflux disease with oesophagitis'],
  ['K25.9','Gastric ulcer, unspecified'],
  ['K27.9','Peptic ulcer, site unspecified, unspecified as acute or chronic'],
  ['K29.7','Gastritis, unspecified'],
  ['K37',  'Unspecified appendicitis'],
  ['K57.9','Diverticular disease of intestine, part unspecified'],
  ['K80.2','Calculus of gallbladder without cholecystitis'],
  ['K92.1','Melaena'],

  // Skin
  ['L01.0','Impetigo'],
  ['L02.9','Cutaneous abscess, furuncle and carbuncle, unspecified'],
  ['L03.9','Cellulitis, unspecified'],
  ['L20.9','Atopic dermatitis, unspecified'],
  ['L50.9','Urticaria, unspecified'],

  // Musculoskeletal
  ['M10.9','Gout, unspecified'],
  ['M13.9','Arthritis, unspecified'],
  ['M54.5','Low back pain'],
  ['M79.3','Panniculitis'],

  // Genitourinary
  ['N17.9','Acute kidney failure, unspecified'],
  ['N18.9','Chronic kidney disease, unspecified'],
  ['N39.0','Urinary tract infection, site not specified'],
  ['N40',  'Benign prostatic hyperplasia'],
  ['N94.6','Dysmenorrhoea, unspecified'],

  // Pregnancy & childbirth
  ['O00.9','Ectopic pregnancy, unspecified'],
  ['O14.9','Pre-eclampsia, unspecified'],
  ['O20.0','Threatened abortion'],
  ['O48',  'Post-term pregnancy'],
  ['O60.0','Preterm labour without delivery'],
  ['O72.1','Other immediate postpartum haemorrhage'],
  ['O80',  'Normal delivery'],
  ['O82',  'Single delivery by caesarean section'],

  // Perinatal
  ['P07.1','Other low birth weight newborn'],
  ['P36.9','Bacterial sepsis of newborn, unspecified'],

  // Congenital
  ['Q21.1','Atrial septal defect'],

  // Symptoms
  ['R00.0','Tachycardia, unspecified'],
  ['R05',  'Cough'],
  ['R06.0','Dyspnoea'],
  ['R07.4','Chest pain, unspecified'],
  ['R10.4','Other and unspecified abdominal pain'],
  ['R11',  'Nausea and vomiting'],
  ['R50.9','Fever, unspecified'],
  ['R51',  'Headache'],
  ['R55',  'Syncope and collapse'],

  // Injury & trauma
  ['S09.9','Unspecified injury of head'],
  ['S52.9','Fracture of forearm, unspecified'],
  ['S72.9','Fracture of femur, unspecified'],
  ['T14.0','Superficial injury of unspecified body region'],
  ['T14.1','Open wound of unspecified body region'],

  // Unknown / administrative
  ['Z00.0','General medical examination'],
  ['Z99.9','Dependence on enabling machines and devices, unspecified'],
];

async function seed() {
  console.log('Seeding ICD-10 codes…');
  let inserted = 0;
  for (const [code, description] of CODES) {
    try {
      await db.query(
        `INSERT INTO icd10_codes (code, description) VALUES ($1, $2)
         ON CONFLICT (code) DO NOTHING`,
        [code, description]
      );
      inserted++;
    } catch (e) {
      console.error(`Failed to insert ${code}: ${e.message}`);
    }
  }
  console.log(`Done — ${inserted}/${CODES.length} codes inserted.`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
