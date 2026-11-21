// Product catalogue: forms, units, packaging.
// ---------- Product catalogue: forms, units, packaging ----------
// Everything a pharmacy, drug shop or clinic typically sells. The pickers are type-to-search
// (js/ui/combobox.js): staff type a few letters to find a word, or type a new one — and what
// they type is remembered and offered next time.
const OTHER_LABEL = 'Other (specify)';
const DRUG_FORMS = {
  'Oral solids': ['Tablet','Film-coated tablet','Chewable tablet','Dispersible tablet','Effervescent tablet','Sublingual tablet','Lozenge','Capsule','Softgel capsule','Granules','Powder (oral)','Sachet (oral powder)'],
  'Oral liquids': ['Syrup','Suspension','Oral solution','Elixir','Oral drops','Emulsion','Oral rehydration salts (ORS)'],
  'Injectables & infusions': ['Injection','Powder for injection','Ampoule','Pre-filled syringe','IV infusion / fluid','Vaccine'],
  'Topical / skin': ['Ointment','Cream','Gel','Lotion','Paste','Liniment / balm','Topical spray','Topical powder','Medicated shampoo','Medicated soap','Patch / plaster'],
  'Eye, ear & nose': ['Eye drops','Eye ointment','Ear drops','Nasal drops','Nasal spray'],
  'Respiratory': ['Inhaler','Nebuliser solution'],
  'Rectal & vaginal': ['Suppository','Pessary','Enema','Vaginal cream / gel'],
  'Antiseptics & mouth care': ['Antiseptic / disinfectant','Mouthwash / gargle','Toothpaste (medicated)'],
  'Supplements & traditional': ['Vitamin / mineral supplement','Herbal / traditional medicine','Nutritional product','Baby formula / food'],
  'Family planning & tests': ['Contraceptive pill','Emergency contraceptive','Condom','Pregnancy test kit','Malaria rapid test kit','HIV self-test kit','Glucose test strips','Other test kit'],
  'Medical supplies & devices': ['Syringe / needle','Cannula / IV set','Gloves','Cotton wool / gauze','Bandage / dressing','Face mask','Thermometer','BP machine','Glucometer','Sanitary pads','Diapers'],
  'Veterinary': ['Veterinary medicine']
};
const DRUG_UNITS = {
  'Counted pieces': ['Tabs','Caps','Pieces','Sachets','Strips','Blisters','Pessaries','Suppositories','Lozenges'],
  'Containers': ['Bottles','Vials','Ampoules','Tubes','Jars / tins','Inhalers','Sprays','Droppers','Bags / pouches','Syringes'],
  'Packs & bundles': ['Packs','Boxes','Cartons','Cards','Dozens','Sets / kits','Pairs','Rolls','Sticks'],
  'By measure': ['Millilitres (ml)','Litres','Grams (g)','Kilograms (kg)']
};
// Other words people type that should find the same unit / form ("tab" -> Tabs, "ml" -> Millilitres).
const UNIT_ALIASES = {
  'Tabs':['tablets','tablet'], 'Caps':['capsules','capsule'], 'Pieces':['pcs','items','units','each'],
  'Sachets':['sachet'], 'Strips':['strip'], 'Blisters':['blister','sheet'], 'Bottles':['bottle','btl'],
  'Vials':['vial'], 'Ampoules':['ampule','amp'], 'Tubes':['tube'], 'Jars / tins':['jar','tin','container'],
  'Packs':['packet','pkt','package'], 'Boxes':['box','bx'], 'Cartons':['carton','ctn'], 'Cards':['card'],
  'Dozens':['doz','dozen','12'], 'Sets / kits':['kit','set'], 'Pairs':['pair','gloves'], 'Rolls':['roll'],
  'Millilitres (ml)':['ml','mls','millilitre','milliliter'], 'Litres':['litre','liter','ltr','l'],
  'Grams (g)':['gram','gm','g'], 'Kilograms (kg)':['kg','kilo','kilogram'], 'Bags / pouches':['bag','pouch'],
  'Syringes':['syringe'], 'Inhalers':['inhaler','puffer'], 'Sprays':['spray'], 'Droppers':['dropper','drops']
};
const FORM_ALIASES = {
  'Tablet':['tabs','tab'], 'Capsule':['caps','cap'], 'Syrup':['syr'], 'Suspension':['susp'], 'Injection':['inj','jab'],
  'IV infusion / fluid':['drip','fluids','iv','infusion'], 'Oral rehydration salts (ORS)':['ors'], 'Powder (oral)':['powder'],
  'Ointment':['oint'], 'Eye drops':['eye'], 'Ear drops':['ear'], 'Nasal drops':['nose'], 'Pessary':['vaginal'],
};

// People: what they trained as (cadre) is separate from the job they do here (position), and
// both are separate from what the app lets them do (Admin or Staff). A nurse can be the administrator.
const CADRES = {
  'Pharmacy': ['Pharmacist','Pharmacy technician','Pharmacy assistant','Dispenser'],
  'Nursing & midwifery': ['Registered nurse','Enrolled nurse','Nursing assistant','Registered midwife','Enrolled midwife'],
  'Medical': ['Medical doctor','Clinical officer','Dental officer','Laboratory technician / technologist','Public health officer'],
  'Other': ['Not a health worker','Administrator (non-medical)','Accountant','Student / intern']
};
const POSITIONS = {
  'Leadership': ['Owner','Director','Administrator','Manager','In-charge','Supervisor'],
  'Day to day': ['Dispenser','Sales attendant','Cashier','Store keeper','Accountant','Receptionist','Cleaner / helper']
};
const CADRE_ALIASES = { 'Registered nurse':['rn','nurse'], 'Enrolled nurse':['en','nurse'], 'Medical doctor':['doctor','mo','dr'], 'Clinical officer':['co'], 'Laboratory technician / technologist':['lab'] };

function optionGroupsHtml(groups, selected, customList){
  let html = '';
  Object.keys(groups).forEach(g=>{
    html += `<optgroup label="${g}">` + groups[g].map(v=>`<option ${v===selected?'selected':''}>${v}</option>`).join('') + `</optgroup>`;
  });
  if(customList && customList.length){
    html += `<optgroup label="Added by you">` + customList.map(v=>`<option ${v===selected?'selected':''}>${esc(v)}</option>`).join('') + `</optgroup>`;
  }
  html += `<option>${OTHER_LABEL}</option>`;
  return html;
}
// Words used by this facility that are not in the built-in lists (offered in the pickers).
function customAccountValues(field, groups){
  const known = new Set([].concat(...Object.values(groups)).map(v=>v.toLowerCase()));
  return Array.from(new Set(STATE.accounts.map(a=>(a[field]||'').trim()).filter(v=>v && !known.has(v.toLowerCase())))).sort();
}
function customCatalogValues(field, groups){
  const known = new Set([].concat(...Object.values(groups)));
  const seen = new Set();
  STATE.drugs.forEach(d=>{ const v = d[field]; if(v && !known.has(v) && v!==OTHER_LABEL) seen.add(v); });
  return Array.from(seen).sort();
}

// A typed word that matches a list word apart from capitals ("tabs" -> "Tabs") uses the list's
// spelling, so the same unit is not saved twice under different capitals.
function matchListWord(v, groups, extra){
  if(!v) return '';
  const all = [].concat(...Object.values(groups), extra || []);
  return all.find(w=>w.toLowerCase() === v.toLowerCase()) || v;
}
