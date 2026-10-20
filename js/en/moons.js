// The important moons of each planet: a kid-friendly explanation plus data for the display.
//
// period - time to orbit the planet, in days (negative = orbits the opposite way, like Triton)
// dist   - distance in the display, in planet radii (shrunk a lot so we can see them all)
// size   - size in the display
// render - false if the moon is already shown another way (our Moon)

export const MOONS = {
  earth: [
    {
      id: 'luna',
      title: 'The Moon',
      emoji: '🌕',
      render: false,
      text:
        'The Moon is our closest neighbor in space. It goes around Earth once about every month, and it always shows us the same side. ' +
        'The Moon does not make its own light. It bounces back the light of the Sun, so it looks different to us. Sometimes it is full, sometimes half, and sometimes just a thin sliver. Those are the phases of the Moon. ' +
        'The Moon has no air and no flowing water, and it is covered with craters, which are holes made when space rocks crashed into it. ' +
        'In 1969 the first person walked on the Moon, and so far only twelve people have ever walked there.',
    },
  ],
  mars: [
    {
      id: 'phobos',
      title: 'Phobos',
      emoji: '🥔',
      period: 0.319,
      dist: 2.2,
      size: 0.13,
      color: '#8a7b6d',
      text:
        'Phobos is the bigger of the two moons of Mars, but it is still very small, only about as big as a city. Its shape is not round. It looks like a potato! ' +
        'Phobos is so close to Mars that it goes around it three times every day! ' +
        'And it is slowly getting closer to Mars, so in tens of millions of years it will break apart or crash into the planet.',
    },
    {
      id: 'deimos',
      title: 'Deimos',
      emoji: '🥔',
      period: 1.263,
      dist: 3.4,
      size: 0.1,
      color: '#9a8c7d',
      text:
        'Deimos is the smaller moon of Mars, and it is farther away. It is shaped like a potato too! ' +
        'Its gravity is very weak, so a kid who jumped on it would float up for a really long time before landing. ' +
        'From the ground of Mars, Deimos looks like a bright star, not like a moon.',
    },
  ],
  jupiter: [
    {
      id: 'io',
      title: 'Io',
      emoji: '🌋',
      period: 1.769,
      dist: 1.7,
      size: 0.24,
      color: '#e6cf62',
      text:
        'Io is the most explosive moon in the solar system! It has hundreds of active volcanoes that shoot yellow and orange sulfur high into space. ' +
        'That is why it looks like a colorful pizza. ' +
        'The gravity of Jupiter keeps squeezing and stretching Io, like a ball of dough, and that heats up its tummy.',
    },
    {
      id: 'europa',
      title: 'Europa',
      emoji: '🧊',
      period: 3.551,
      dist: 2.2,
      size: 0.21,
      color: '#d9ccb4',
      text:
        'Europa is covered with a thick layer of ice, and hiding under the ice is a giant ocean of salty water, with more water than all the oceans on Earth put together! ' +
        'Scientists think there might be tiny living things there, so a special spacecraft was sent to explore it.',
    },
    {
      id: 'ganymede',
      title: 'Ganymede',
      emoji: '👑',
      period: 7.155,
      dist: 2.85,
      size: 0.32,
      color: '#9e9384',
      text:
        'Ganymede is the biggest moon in the solar system. It is even bigger than the planet Mercury! ' +
        'It is the only moon with a magnetic field of its own, like a giant magnet, and an ocean is probably hiding under its ice.',
    },
    {
      id: 'callisto',
      title: 'Callisto',
      emoji: '🕳️',
      period: 16.69,
      dist: 3.6,
      size: 0.3,
      color: '#6e6256',
      text:
        'Callisto is one of the most crater-covered places in the solar system. ' +
        'Its surface has hardly changed for billions of years, so it is like a history book of all the rocks that crashed into it from space.',
    },
  ],
  saturn: [
    {
      id: 'enceladus',
      title: 'Enceladus',
      emoji: '⛲',
      period: 1.37,
      dist: 2.65,
      size: 0.12,
      color: '#f4f6f8',
      text:
        'Enceladus is a small, white moon like a snowball, and one of the brightest things in the solar system. ' +
        'Giant fountains of water and ice burst into space from its south pole, just like geysers. ' +
        'Under the ice there is an ocean, and scientists think it might have just the right conditions for life.',
    },
    {
      id: 'titan',
      title: 'Titan',
      emoji: '🟠',
      period: 15.95,
      dist: 3.6,
      size: 0.3,
      color: '#d9a441',
      text:
        'Titan is the big moon of Saturn, and the only moon with a thick atmosphere, even thicker than the atmosphere of Earth. ' +
        'It has lakes and rivers, but they are not made of water. They are made of liquid methane, because it is really, really cold there. ' +
        'A spacecraft called Huygens already landed on Titan, and in the next few years a flying drone called Dragonfly is supposed to fly there.',
    },
  ],
  uranus: [
    {
      id: 'miranda',
      title: 'Miranda',
      emoji: '🧩',
      period: 1.413,
      dist: 2.0,
      size: 0.12,
      color: '#a6a6a6',
      text:
        'Miranda is a small moon of Uranus, with the strangest face of all. It looks like it was glued together from different pieces, like a puzzle. ' +
        'It has a giant cliff about twenty kilometers tall, more than twice as tall as Mount Everest!',
    },
    {
      id: 'titania',
      title: 'Titania',
      emoji: '🧚',
      period: 8.706,
      dist: 3.2,
      size: 0.17,
      color: '#b8aea6',
      text:
        'Titania is the biggest moon of Uranus, and it is made of about half ice and half rock. ' +
        'The moons of Uranus are named after characters in plays by the famous writer Shakespeare, and Titania is the queen of the fairies in one of his plays.',
    },
  ],
  neptune: [
    {
      id: 'triton',
      title: 'Triton',
      emoji: '↩️',
      period: -5.877,
      dist: 2.6,
      size: 0.22,
      color: '#d6c6bf',
      text:
        'Triton is the big moon of Neptune, and it goes around the planet in the opposite direction, unlike all the other big moons in the solar system. ' +
        'It was probably once a loner wandering through space, until Neptune caught it with its gravity. ' +
        'Triton is one of the coldest places ever measured, and it has geysers that shoot out nitrogen gas.',
    },
  ],
  pluto: [
    {
      id: 'charon',
      title: 'Charon',
      emoji: '💃',
      period: 6.387,
      dist: 2.8,
      size: 0.28,
      color: '#9e968f',
      text:
        'Charon is the big moon of Pluto, and it is almost half as big as Pluto itself! ' +
        'Pluto and Charon always show each other the same side, as if they were dancing together and holding hands. ' +
        'At the north pole of Charon there is a reddish patch nicknamed Mordor, after the land in the story The Lord of the Rings.',
    },
  ],
};
