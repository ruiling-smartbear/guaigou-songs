# Single source for music styles. Run: python3 tools/styles.py  (rewrites the style blocks in worker and site)
import json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent

CATS = [
  ('hot', '常用'), ('cn', '中国风'), ('pop', '流行摇滚'), ('groove', '节奏律动'),
  ('world', '世界风情'), ('soft', '安静轻柔'), ('fun', '好玩'),
]
# id, label, categories, Suno tags
STYLES = [
  ('surprise', '随便来一个', 'hot', ''),
  ('nostalgic', '怀旧老歌', 'hot', '1980s Mandopop nostalgic ballad, warm vocal, acoustic guitar, soft strings'),
  ('tender', '温柔抒情', 'hot soft', 'gentle Mandarin ballad, piano, soft strings, heartfelt'),
  ('cheerful', '欢快热闹', 'hot', 'upbeat Chinese folk pop, cheerful, accordion, hand claps, bright'),
  ('squaredance', '广场舞', 'hot fun', 'Chinese square dance pop, four-on-the-floor beat, catchy synth, festive'),
  ('campus', '校园民谣', 'hot pop', '1990s Chinese campus folk, acoustic guitar, harmonica, youthful and sincere'),
  ('rnb', 'R&B', 'hot groove', 'contemporary R&B, smooth soulful vocal, silky groove, warm keys'),
  ('reggae', '雷鬼', 'hot world', 'reggae, offbeat guitar skank, laid-back groove, sunny bass'),
  ('folk', '民歌小调', 'cn', 'Chinese folk song, erhu, dizi, pentatonic melody, storytelling'),
  ('jiangnan', '江南小调', 'cn', 'Jiangnan folk tune, pipa, guzheng, soft and graceful, water town feeling'),
  ('guofeng', '古风', 'cn', 'Chinese guofeng ancient style pop, guzheng, dizi, poetic and elegant'),
  ('northwest', '西北风', 'cn', 'Chinese northwest folk rock, xintianyou style, suona, big drums, bold and open'),
  ('grassland', '草原风', 'cn', 'Mongolian grassland style, morin khuur, long-tune vocal, wide and free'),
  ('opera', '戏曲味儿', 'cn', 'Chinese opera inspired pop, jinghu, gongs and cymbals, theatrical vocal'),
  ('errenzhuan', '东北二人转', 'cn fun', 'Northeast China errenzhuan style, suona, lively call and response, humorous'),
  ('hkpop', '港风老歌', 'cn pop', '1980s Hong Kong pop ballad, saxophone, lush synth pads, romantic'),
  ('army', '军歌', 'cn', 'Chinese military march song, brass band, snare drums, proud group chorus'),
  ('choir', '大合唱', 'cn', 'grand choir, orchestral, uplifting chorus, ceremonial'),
  ('pop', '流行', 'pop', 'modern Mandopop, catchy hook, polished production'),
  ('rock', '摇滚', 'pop', 'Chinese rock, electric guitar, powerful drums, anthemic chorus'),
  ('punk', '朋克', 'pop', 'pop punk, fast drums, distorted guitars, energetic shout-along chorus'),
  ('metal', '重金属', 'pop', 'heavy metal, distorted guitars, double kick drums, powerful vocal'),
  ('indie', '独立小清新', 'pop soft', 'indie pop, dreamy guitars, warm lo-fi texture, gentle vocal'),
  ('citypop', '城市流行', 'pop groove', 'Japanese city pop, 1980s, funky bass, glossy synths'),
  ('kpop', '韩流', 'pop groove', 'K-pop style dance pop, energetic, punchy beat, catchy chorus'),
  ('disco', '迪斯科', 'groove', '1980s disco, funky bass, groovy, retro synth, dance'),
  ('funk', '放克', 'groove', 'funk, slap bass, tight horns, wah guitar, groovy'),
  ('soul', '灵魂乐', 'groove', 'classic soul, Motown feel, warm horns, emotional vocal'),
  ('rap', '说唱', 'groove', 'Chinese hip hop, rap verses, boom bap beat, catchy sung hook'),
  ('lofi', 'Lo-fi', 'groove soft', 'lofi hip hop, chill beats, vinyl crackle, mellow keys'),
  ('electro', '电音', 'groove', 'upbeat electronic dance pop, punchy synth bass, bright drop'),
  ('latin', '拉丁', 'world', 'latin pop, bossa nova, nylon guitar, light percussion, sunny'),
  ('flamenco', '弗拉门戈', 'world', 'flamenco, passionate spanish guitar, hand claps, fiery'),
  ('tango', '探戈', 'world', 'tango, bandoneon, dramatic strings, sharp rhythm'),
  ('country', '乡村', 'world', 'country folk, banjo, acoustic guitar, warm storytelling'),
  ('blues', '蓝调', 'world', 'delta blues, slide guitar, harmonica, soulful and raw'),
  ('gospel', '福音合唱', 'world', 'gospel choir, hammond organ, hand claps, joyful'),
  ('irish', '爱尔兰民谣', 'world', 'irish folk, fiddle, tin whistle, lively jig'),
  ('hawaii', '夏威夷', 'world', 'hawaiian, ukulele, steel guitar, breezy and sunny'),
  ('afro', '非洲鼓', 'world', 'afrobeat, djembe, joyful percussion, bright guitars'),
  ('jazz', '爵士', 'soft world', 'smooth jazz swing, saxophone, upright bass, brushed drums, lounge'),
  ('piano', '钢琴弹唱', 'soft', 'solo piano ballad, intimate vocal, tender'),
  ('acoustic', '木吉他', 'soft', 'acoustic guitar singer-songwriter, warm and intimate'),
  ('waltz', '圆舞曲', 'soft', 'romantic waltz, 3/4 time, strings, accordion, ballroom'),
  ('classical', '古典', 'soft', 'classical crossover, orchestra, operatic vocal, grand'),
  ('lullaby', '摇篮曲', 'soft', 'lullaby, soft music box, gentle humming vocal, warm and slow'),
  ('kids', '儿歌', 'fun', 'children song, simple catchy melody, glockenspiel, playful'),
  ('chiptune', '游戏机', 'fun', '8-bit chiptune, retro video game, bouncy and bright'),
  ('cartoon', '动画片主题曲', 'fun', 'cartoon theme song, bouncy brass, playful and silly'),
  ('circus', '马戏团', 'fun', 'circus march, oompah tuba, whimsical and quirky'),
  ('polka', '波尔卡', 'fun', 'polka, accordion, oompah bass, cheerful dance'),
  ('acappella', '阿卡贝拉', 'fun', 'a cappella, layered vocal harmonies, beatbox'),
  ('shanty', '水手号子', 'fun', 'sea shanty, stomping rhythm, rousing group vocals'),
]

def block(text, start, end, body):
    a = text.index(start); b = text.index(end, a) + len(end)
    return text[:a] + body + text[b:]

tags = {sid: t for sid, _, _, t in STYLES if t}
w = ROOT / 'worker/src/index.js'
s = w.read_text()
body = 'const STYLES = {\n' + ''.join(f'  {k}: {json.dumps(v)},\n' for k, v in tags.items()) + '};'
s = block(s, 'const STYLES = {', '};', body)
w.write_text(s)

site = [{'id': sid, 'label': l, 'cats': c.split()} for sid, l, c, _ in STYLES]
js = ROOT / 'docs/styles.js'
js.write_text('// Generated by tools/styles.py. Edit the list there, not here.\nwindow.GG_STYLES = ' +
              json.dumps({'cats': CATS, 'styles': site}, ensure_ascii=False, indent=1) + ';\n')
print(len(STYLES), 'styles')
