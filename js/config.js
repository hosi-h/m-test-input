// チェック項目・種目などの定義。
// ここには秘密の情報（合言葉・GASのURL）を書かないこと。それらはiPadの設定画面で入力する。

const APP_VERSION = '1.1.0';

// 部位ごとの動作。dirs は2つの方向ボタンのラベル。
// column: 画面の左列(0)・右列(1)
const BODY_PARTS = [
  { part: '頸', column: 0, motions: [
    { name: '屈曲', dirs: ['前屈', '後屈'] },
    { name: '回旋', dirs: ['右', '左'] },
    { name: '側屈', dirs: ['右', '左'] },
  ]},
  { part: '肩', column: 0, motions: [
    { name: '伸展', dirs: ['右', '左'] },
    { name: '屈曲', dirs: ['右', '左'] },
    { name: '水平屈曲', dirs: ['右', '左'] },
    { name: '水平伸展', dirs: ['右', '左'] },
  ]},
  { part: '肘', column: 0, motions: [
    { name: '回内', dirs: ['右', '左'] },
    { name: '回外', dirs: ['右', '左'] },
    { name: '屈曲', dirs: ['右', '左'] },
    { name: '伸展', dirs: ['右', '左'] },
  ]},
  { part: '手首', column: 0, motions: [
    { name: '尺屈', dirs: ['右', '左'] },
    { name: '橈屈', dirs: ['右', '左'] },
    { name: '掌屈', dirs: ['右', '左'] },
    { name: '背屈', dirs: ['右', '左'] },
  ]},
  { part: '股', column: 1, motions: [
    { name: '伸展', dirs: ['右', '左'] },
    { name: '屈曲', dirs: ['右', '左'] },
    { name: '屈曲（膝屈曲）', dirs: ['右', '左'] },
    { name: '外旋', dirs: ['右', '左'] },
    { name: '内転', dirs: ['右', '左'] },
    { name: '外転', dirs: ['右', '左'] },
  ]},
  { part: '膝', column: 1, motions: [
    { name: '屈曲', dirs: ['右', '左'] },
  ]},
  { part: '足首', column: 1, motions: [
    { name: '底屈', dirs: ['右', '左'] },
    { name: '背屈', dirs: ['右', '左'] },
    { name: '内反', dirs: ['右', '左'] },
    { name: '外反', dirs: ['右', '左'] },
  ]},
  { part: '腰', column: 1, motions: [
    { name: '屈曲', dirs: ['前屈', '後屈'] },
    { name: '回旋', dirs: ['右', '左'] },
    { name: '側屈', dirs: ['右', '左'] },
  ]},
];

// 動作を1列に並べたもの（キーは「部位_動作」）
const MOTIONS = BODY_PARTS.flatMap(p =>
  p.motions.map(m => ({ key: `${p.part}_${m.name}`, part: p.part, name: m.name, dirs: m.dirs }))
);

const SEXES = ['男性', '女性', 'その他'];

// 種目とポジション。どの種目にも「なし・未定」「その他（自由入力）」が自動で付く。
const SPORTS = [
  { name: 'サッカー', positions: ['GK', 'DF', 'MF', 'FW'] },
  { name: '野球', positions: ['投手', '捕手', '内野手', '外野手'] },
  { name: '陸上', positions: ['短距離', '中距離', '長距離', '跳躍', '投てき', '混成', '競歩'] },
  { name: 'バスケットボール', positions: ['PG', 'SG', 'SF', 'PF', 'C'] },
  { name: 'バレーボール', positions: ['セッター', 'アウトサイドヒッター', 'ミドルブロッカー', 'オポジット', 'リベロ'] },
  { name: 'テニス', positions: ['シングルス', 'ダブルス'] },
  { name: 'ラグビー', positions: ['FW第1列', 'FW第2列', 'FW第3列', 'SH', 'SO', 'CTB', 'WTB', 'FB'] },
];
const OTHER = 'その他';
const POSITION_NONE = 'なし・未定';

// 利き手・利き脚、既往歴（ケガ・疾患）の選択肢。「その他」を含むものは自由入力欄が出る。
const LATERALITY = ['右', '左', '両'];
const YES = 'あり';
const YES_NO = ['なし', YES];
const INJURY_PARTS = ['頸', '肩', '肘', '手首', '腰', '股', '膝', '足首', OTHER];
const INJURY_TYPES = ['骨折', '捻挫', '肉離れ', '脱臼', '靱帯損傷', OTHER];
const INJURY_NOW = ['完治', '治療中', 'リハビリ中', '痛みあり'];
const DISEASE_NOW = ['完治', '治療中', '経過観察'];

// スプレッドシート・Excelの列（1回の測定＝1行）
// HISTORY_COLUMNS は v1.1.0 で追加した列。v1.0.0 の行は、ポジションの後ろに空欄を入れて揃える。
const HISTORY_COLUMNS = [
  '利き手', '利き脚',
  'ケガ_有無', 'ケガ_場所', 'ケガ_状態', 'ケガ_現在の状態',
  '疾患_有無', '疾患名', '疾患_現在の状態',
];
const BASE_COLUMNS = ['測定番号', '測定日時', '端末', '氏名', '生年月日', '年齢', '性別', '種目', 'ポジション', ...HISTORY_COLUMNS];
const CHECK_COLUMNS = MOTIONS.flatMap(m => [
  `${m.key}_確認済`,
  `${m.key}_${m.dirs[0]}`,
  `${m.key}_${m.dirs[1]}`,
]);
const ALL_COLUMNS = [...BASE_COLUMNS, ...CHECK_COLUMNS];
