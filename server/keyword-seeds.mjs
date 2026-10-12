// Editorial topics and search-intent expansions; no measured popularity is implied.
const groups = [
 ['睡眠与情绪','失眠|insomnia;睡眠|sleep;睡眠质量|sleep quality;入睡困难|difficulty falling asleep;深度睡眠|deep sleep;夜间醒来|night waking;时差|jet lag;压力|stress;焦虑|anxiety;情绪平衡|mood balance'],
 ['女性健康','更年期|menopause;围绝经期|perimenopause;潮热|hot flashes;盗汗|night sweats;经前综合征|PMS;月经健康|menstrual health;女性激素平衡|female hormone balance;女性生育健康|female fertility;卵巢健康|ovarian health;私密健康|vaginal health'],
 ['消化与肠道','胃胀|bloating;消化|digestion;肠道健康|gut health;肠道菌群|gut microbiome;排便规律|bowel regularity;便秘|constipation;胃酸反流|acid reflux;肠易激|irritable bowel;乳糖消化|lactose digestion;消化酶支持|digestive enzyme support'],
 ['抗衰与细胞','抗衰|anti aging;健康老龄化|healthy aging;长寿|longevity;细胞健康|cellular health;细胞能量|cellular energy;线粒体健康|mitochondrial health;氧化应激|oxidative stress;抗氧化|antioxidant;自噬|autophagy;端粒健康|telomere health'],
 ['皮肤与美容','皮肤健康|skin health;皮肤保湿|skin hydration;皮肤弹性|skin elasticity;皱纹|wrinkles;胶原蛋白支持|collagen support;头发生长|hair growth;头发稀疏|thinning hair;指甲健康|nail health;皮肤屏障|skin barrier;皮肤光泽|skin radiance'],
 ['体重与代谢','体重管理|weight management;减重|weight loss;食欲管理|appetite control;饱腹感|satiety;代谢健康|metabolic health;血糖支持|blood sugar support;胰岛素敏感性|insulin sensitivity;脂肪代谢|fat metabolism;热量消耗|thermogenesis;糖分渴望|sugar cravings'],
 ['心血管健康','心脏健康|heart health;心血管健康|cardiovascular health;胆固醇支持|cholesterol support;血压支持|blood pressure support;血液循环|circulation;血管健康|vascular health;甘油三酯支持|triglyceride support;内皮健康|endothelial health;同型半胱氨酸支持|homocysteine support;一氧化氮支持|nitric oxide support'],
 ['骨骼与关节','骨骼健康|bone health;骨密度|bone density;关节健康|joint health;关节灵活性|joint flexibility;软骨健康|cartilage health;关节舒适|joint comfort;肌腱健康|tendon health;韧带健康|ligament health;腰背舒适|back comfort;活动能力|mobility'],
 ['脑力与认知','脑部健康|brain health;记忆力|memory;专注力|focus;认知功能|cognitive function;脑雾|brain fog;思维清晰|mental clarity;学习能力|learning;神经健康|nerve health;神经保护|neuroprotection;精神警觉|mental alertness'],
 ['免疫与季节','免疫支持|immune support;免疫健康|immune health;季节性健康|seasonal wellness;呼吸道健康|respiratory health;喉部舒适|throat comfort;鼻窦健康|sinus health;季节性过敏|seasonal allergies;肠道免疫|gut immunity;免疫平衡|immune balance;旅行免疫|travel immunity'],
 ['运动与恢复','运动表现|sports performance;肌肉增长|muscle growth;运动恢复|exercise recovery;肌肉恢复|muscle recovery;耐力|endurance;力量|strength;运动前支持|pre workout;运动后支持|post workout;电解质平衡|electrolyte balance;肌肉酸痛|muscle soreness'],
 ['男性健康','男性健康|mens health;前列腺健康|prostate health;睾酮支持|testosterone support;男性生育健康|male fertility;精子健康|sperm health;男性活力|male vitality;性欲支持|libido support;性健康|sexual health;男性激素平衡|male hormone balance;男性泌尿健康|male urinary health'],
 ['泌尿与器官','泌尿健康|urinary health;膀胱健康|bladder health;肾脏健康|kidney health;肝脏健康|liver health;肝脏支持|liver support;胆囊健康|gallbladder health;肺部健康|lung health;甲状腺健康|thyroid health;肾上腺支持|adrenal support;胰腺健康|pancreatic health'],
 ['眼耳口腔','眼部健康|eye health;视力支持|vision support;黄斑健康|macular health;蓝光支持|blue light support;干眼|dry eyes;夜间视力|night vision;听力健康|hearing health;耳鸣|tinnitus;口腔健康|oral health;牙龈健康|gum health'],
 ['能量与日常','能量支持|energy support;疲劳|fatigue;日间活力|daytime energy;慢性疲劳|chronic fatigue;营养缺口|nutritional gaps;每日营养|daily nutrition;水合支持|hydration support;营养吸收|nutrient absorption;素食营养|vegan nutrition;饮食平衡|dietary balance'],
 ['人生阶段','儿童营养|childrens nutrition;青少年营养|teen nutrition;产前营养|prenatal nutrition;孕期营养|pregnancy nutrition;产后营养|postpartum nutrition;哺乳期营养|breastfeeding nutrition;老年营养|senior nutrition;女性营养|womens nutrition;男性营养|mens nutrition;中年健康|midlife health'],
 ['神经与放松','放松|relaxation;平静|calm;应激适应|stress adaptation;神经系统支持|nervous system support;GABA支持|GABA support;血清素支持|serotonin support;多巴胺支持|dopamine support;昼夜节律|circadian rhythm;皮质醇平衡|cortisol balance;情绪健康|emotional wellness'],
 ['微量营养支持','铁营养支持|iron support;钙营养支持|calcium support;镁营养支持|magnesium support;锌营养支持|zinc support;硒营养支持|selenium support;维生素D支持|vitamin D support;维生素B12支持|vitamin B12 support;叶酸支持|folate support;胆碱支持|choline support;碘营养支持|iodine support'],
 ['功能营养','益生菌支持|probiotic support;益生元支持|prebiotic support;后生元支持|postbiotic support;膳食纤维支持|fiber support;欧米伽3支持|omega 3 support;蛋白质补充|protein supplementation;氨基酸支持|amino acid support;必需脂肪酸支持|essential fatty acid support;多酚支持|polyphenol support;植物营养支持|phytonutrient support'],
 ['健康生活','健康炎症反应|healthy inflammatory response;经期舒适|menstrual comfort;女性骨骼健康|womens bone health;更年期睡眠|menopause sleep;健康体成分|healthy body composition;情绪性进食|emotional eating;夜间放松|nighttime relaxation;运动水合|exercise hydration;屏幕眼疲劳|digital eye strain;健康免疫反应|healthy immune response']
];
const aliases={
 '更年期':['menopausal','menopausal symptoms'],'围绝经期':['perimenopausal'],
 '抗衰':['anti-aging','anti-ageing','anti ageing'],'睡眠':['sleeping','sleep support'],
 '胃胀':['stomach bloating','gas and bloating'],'专注力':['concentration'],
 '男性健康':["men’s health","men's health"],'女性营养':["women’s nutrition","women's nutrition"],
 '欧米伽3支持':['omega-3','omega 3'],'季节性过敏':['seasonal allergy'],
 '益生菌支持':['probiotics','probiotic'],'益生元支持':['prebiotics','prebiotic'],
 '膳食纤维支持':['dietary fiber','dietary fibre']
};
const intents=[
 [(z)=>z,(e)=>e,'topic'],
 [(z)=>z+'营养方案',(e)=>e+' nutritional support','intent'],
 [(z)=>z+'补充剂',(e)=>e+' supplements','intent'],
 [(z)=>z+'保健品',(e)=>e+' dietary supplements','intent'],
 [(z)=>z+'天然补充剂',(e)=>e+' natural supplements','intent'],
 [(z)=>z+'补充剂成分',(e)=>e+' supplement ingredients','intent'],
 [(z)=>z+'补充剂比较',(e)=>e+' supplement comparison','intent'],
 [(z)=>z+'补充剂安全性',(e)=>e+' supplement safety','intent'],
 [(z)=>z+'补充剂用量',(e)=>e+' supplement dosage','intent'],
 [(z)=>z+'补充剂评价',(e)=>e+' supplement reviews','intent']
];
export function generateKeywordSeeds(){
 return groups.flatMap(([category,topics])=>topics.split(';').flatMap(topic=>{
  const [zh,en]=topic.split('|');return intents.map(([z,e,type])=>({name_zh:z(zh),name_en:e(en),category,aliases:type==='topic'?(aliases[zh]||[]):[],keyword_type:type,source:'editorial_taxonomy_v1',heat_status:'unverified'}));
 }));
}
