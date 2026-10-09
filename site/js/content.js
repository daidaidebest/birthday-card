// ✎ Everything personal lives here. Replace the sample photos with your own:
//   put the image files in assets/img/ and change `src`, `title` and `caption`.
//   For the 2.5D "living photo" effect, also run tools/depth.py and tools/layers.py on each new photo
//   (see README); photos without depth planes simply get a gentle Ken Burns move.
window.GIFT_CONTENT = window.GIFT_CONTENT || {};
window.GIFT_CONTENT.PHOTOS = [
  { src: 'assets/img/photo-ocean-evening.webp', title: '把黄昏留给你', caption: '希望往后的日子，有很多可以一起慢慢看的落日。', credit: 'Veronica MORENO-ALVAREZ / Unsplash', pos: '50% 50%' },
  { src: 'assets/img/photo-sunlit-book.webp', title: '寻常的一页，也会发光', caption: '愿我们在普通的日子里，也能找到一点小小的魔法。', credit: 'Aaron Burden / Unsplash', pos: '50% 62%' },
  { src: 'assets/img/photo-night-sky.webp', title: '给愿望留一片星空', caption: '今晚，所有温柔的星光，都想把祝福送给你。', credit: 'Nathan Anderson / Unsplash', pos: '50% 50%' },
];
// The letter is your original birthday letter, word for word; the P.S. is the only added line.
window.GIFT_CONTENT.LETTER = {
  greeting: '亲爱的师宝宝：',
  paragraphs: [
    '今天，想把所有温柔的祝福都送给你。愿你醒来有好心情，抬头有好风景，也总有人认真听你说那些小小的欢喜。',
    '愿你一直保留好奇和勇气，去喜欢自己喜欢的事，走自己想走的路。偶尔累了，就慢一点；偶尔想撒娇，也完全没关系。',
    '新的一岁，希望你的快乐多一点，烦恼少一点。那些还没实现的愿望，就交给以后的每一个明天。你只管带着期待向前走。',
    '愿你一直勇敢，也一直被爱。',
  ],
  closing: '生日快乐呀 ♡',
  ps: 'P.S. 今晚我在东京，很想你。',
};
