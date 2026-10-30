// ✎ Everything personal lives here. Replace the sample photos with your own:
//   put the image files in assets/img/ and change `src`, `title` and `caption`.
//   For the 2.5D "living photo" effect, also run tools/depth.py and tools/layers.py on each new photo
//   (see README); photos without depth planes simply get a gentle Ken Burns move.
window.GIFT_CONTENT = window.GIFT_CONTENT || {};
window.GIFT_CONTENT.PHOTOS = [
  { src: 'assets/img/memory-01.jpg', title: '把小小的欢喜留给你', caption: '宝宝喜欢小狗，我喜欢你看见小狗时，眼睛里亮起来的欢喜。', back: '想陪你遇见更多小狗，\n也收藏更多亮晶晶的笑。', credit: '', pos: '50% 50%' },
  { src: 'assets/img/memory-02.jpg', title: '和你一起的每一天', caption: '和宝宝一起，寻常的每一天，也都有了值得收藏的小小欢喜。', back: '那些一起度过的日子，\n每一页都舍不得翻过。', credit: '', pos: '50% 35%' },
  { src: 'assets/img/memory-03.jpg', title: '抱着你，连梦也是甜的', caption: '抱着宝宝睡觉，心里就安安稳稳的，连梦也像是甜的。', back: '把你轻轻抱在怀里，\n就是我最安心的夜晚。', credit: '', pos: '50% 20%' },
  { src: 'assets/img/memory-04.jpg', title: '把快乐留在莲花山', caption: '想把莲花山的风和那天的快乐，都好好收起来，留着以后和宝宝慢慢回想。', back: '莲花山的风轻轻吹，\n那天和你在一起，真好。', credit: '', pos: '50% 50%' },
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
