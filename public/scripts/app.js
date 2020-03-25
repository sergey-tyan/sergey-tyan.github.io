const board = document.getElementById('board');
const showPickedButton = document.getElementById('show-picked');
const pickedContainer = document.getElementById('picked-movies');
const dislikeButton = document.getElementById('dislike');
const pickButton = document.getElementById('pick');
const likeButton = document.getElementById('like');

showPickedButton.addEventListener('click', () => {
  if (pickedContainer.style.display === 'none') {
    pickedContainer.style.display = 'block';
  } else {
    pickedContainer.style.display = 'none';
  }
});

const API_BASE = 'https://dev.jfhs.me';
class Carousel {
  constructor(element) {
    this.board = element;

    this.init();
    this.count = 0;
    this.movies = {};

    likeButton.addEventListener('click', () => {
      this.buttonClicked('liked');
    });

    pickButton.addEventListener('click', () => {
      this.updatePickedList();
      this.buttonClicked('picked');
    });

    dislikeButton.addEventListener('click', () => {
      this.buttonClicked('disliked');
    });
  }

  buttonClicked(type) {
    const { id } = this.topCard;
    this.count++;
    this.session[type].push(id);
    this.updateSession();
    this.board.removeChild(this.topCard);
    delete this.movies[id];
    this.handle();
  }

  updatePickedList() {
    const movie = this.movies[this.topCard.id];
    const link = document.createElement('a');
    link.href = `https://www.themoviedb.org/movie/${this.topCard.id}`;
    link.innerText = movie.title;
    pickedContainer.appendChild(link);
    const br = document.createElement('br');
    pickedContainer.appendChild(br);
  }

  async init() {
    this.session = await this.loadMoviesToStart();
    this.putAllMoviesToQueue();
  }

  async putAllMoviesToQueue() {
    const movieInfos = await this.loadMovies(this.session.suggestions_queue);
    movieInfos.forEach(movie => this.push(movie));
    this.handle();
  }

  async loadMovies(movieIds) {
    return Promise.all(
      movieIds.map(movieId =>
        fetch(`${API_BASE}/api/movies/${movieId}`).then(r => r.json()),
      ),
    );
  }

  async loadMoviesToStart() {
    return fetch(`${API_BASE}/api/explore`, { method: 'POST' }).then(r =>
      r.json(),
    );
  }

  async updateSession() {
    this.session = await fetch(`${API_BASE}/api/explore/${this.session.id}`, {
      method: 'PUT',
      body: JSON.stringify(this.session),
      headers: {
        'Content-Type': 'application/json',
      },
    }).then(r => r.json());

    if (this.count === 6) {
      this.putAllMoviesToQueue();
      return;
    }
    if (this.count > 6) {
      this.updateQueueWithLatestMovies();
    }
  }

  async updateQueueWithLatestMovies() {
    const movieInfos = await this.loadMovies(this.session.suggestions_queue);
    const cards = this.board.querySelectorAll('.card');
    for (let i = 0; i < cards.length - 2; i++) {
      const id = cards[i].id;
      delete this.movies[id];
      cards[i].remove();
    }
    movieInfos.forEach(movie => this.push(movie));
  }

  handle() {
    // list all cards
    this.cards = this.board.querySelectorAll('.card');

    // get top card
    this.topCard = this.cards[this.cards.length - 1];

    // get next card
    this.nextCard = this.cards[this.cards.length - 2];

    // if at least one card is present
    if (this.cards.length > 0) {
      // set default top card position and scale
      this.topCard.style.transform =
        'translateX(-50%) translateY(-50%) rotate(0deg) rotateY(0deg) scale(1)';

      // destroy previous Hammer instance, if present
      if (this.hammer) this.hammer.destroy();

      // listen for tap and pan gestures on top card
      this.hammer = new Hammer(this.topCard);
      this.hammer.add(new Hammer.Tap());
      this.hammer.add(
        new Hammer.Pan({
          position: Hammer.position_ALL,
          threshold: 0,
        }),
      );

      // pass events data to custom callbacks
      this.hammer.on('tap', e => {
        this.onTap(e);
      });
      this.hammer.on('pan', e => {
        this.onPan(e);
      });
    }
  }

  onTap(e) {
    // get finger position on top card
    let propX =
      (e.center.x - e.target.getBoundingClientRect().left) /
      e.target.clientWidth;

    // get degree of Y rotation (+/-15 degrees)
    let rotateY = 15 * (propX < 0.05 ? -1 : 1);

    // change the transition property
    this.topCard.style.transition = 'transform 100ms ease-out';

    // rotate
    this.topCard.style.transform =
      'translateX(-50%) translateY(-50%) rotate(0deg) rotateY(' +
      rotateY +
      'deg) scale(1)';
    const movie = this.movies[this.topCard.id];
    if (movie) {
      movie.expanded = !movie.expanded;
    }

    this.updateCardState(this.topCard);

    // wait transition end
    setTimeout(() => {
      // reset transform properties
      this.topCard.style.transform =
        'translateX(-50%) translateY(-50%) rotate(0deg) rotateY(0deg) scale(1)';
    }, 100);
  }

  onPan(e) {
    if (!this.isPanning) {
      this.isPanning = true;

      // remove transition properties
      this.topCard.style.transition = null;
      if (this.nextCard) this.nextCard.style.transition = null;

      // get top card coordinates in pixels
      let style = window.getComputedStyle(this.topCard);
      let mx = style.transform.match(/^matrix\((.+)\)$/);
      this.startPosX = mx ? parseFloat(mx[1].split(', ')[4]) : 0;
      this.startPosY = mx ? parseFloat(mx[1].split(', ')[5]) : 0;

      // get top card bounds
      let bounds = this.topCard.getBoundingClientRect();

      // get finger position on top card, top (1) or bottom (-1)
      this.isDraggingFrom =
        e.center.y - bounds.top > this.topCard.clientHeight / 2 ? -1 : 1;
    }

    // calculate new coordinates
    let posX = e.deltaX + this.startPosX;
    let posY = e.deltaY + this.startPosY;

    // get ratio between swiped pixels and the axes
    let propX = e.deltaX / this.board.clientWidth;
    let propY = e.deltaY / this.board.clientHeight;

    // get swipe direction, left (-1) or right (1)
    let dirX = e.deltaX < 0 ? -1 : 1;

    // calculate rotation, between 0 and +/- 45 deg
    let deg = this.isDraggingFrom * dirX * Math.abs(propX) * 45;

    // calculate scale ratio, between 95 and 100 %
    let scale = (95 + 5 * Math.abs(propX)) / 100;

    // move top card
    this.topCard.style.transform =
      'translateX(' +
      posX +
      'px) translateY(' +
      posY +
      'px) rotate(' +
      deg +
      'deg) rotateY(0deg) scale(1)';

    // scale next card
    if (this.nextCard)
      this.nextCard.style.transform =
        'translateX(-50%) translateY(-50%) rotate(0deg) rotateY(0deg) scale(' +
        scale +
        ')';

    if (e.isFinal) {
      this.isPanning = false;

      let successful = false;

      // set back transition properties
      this.topCard.style.transition = 'transform 200ms ease-out';
      if (this.nextCard)
        this.nextCard.style.transition = 'transform 100ms linear';

      // check threshold
      let direction = null;
      if (propX > 0.25 && e.direction == Hammer.DIRECTION_RIGHT) {
        successful = true;
        direction = 'liked';
        // get right border position
        posX = this.board.clientWidth;
      } else if (propX < -0.25 && e.direction == Hammer.DIRECTION_LEFT) {
        successful = true;
        direction = 'disliked';
        // get left border position
        posX = -(this.board.clientWidth + this.topCard.clientWidth);
      } else if (propY < -0.25 && e.direction == Hammer.DIRECTION_UP) {
        successful = true;
        direction = 'picked';
        // get top border position
        posY = -(this.board.clientHeight + this.topCard.clientHeight);
      }

      if (successful) {
        console.log({ direction });
        this.count++;
        if (direction !== null) {
          this.session[direction].push(this.topCard.id);
          if (direction === 'picked') {
            this.updatePickedList();
          } else {
            delete this.movies[this.topCard.id];
          }

          this.updateSession();
        }
        // throw card in the chosen direction
        this.topCard.style.transform =
          'translateX(' +
          posX +
          'px) translateY(' +
          posY +
          'px) rotate(' +
          deg +
          'deg)';

        // wait transition end
        setTimeout(() => {
          this.board.removeChild(this.topCard);
          this.handle();
        }, 200);
      } else {
        // reset cards position
        this.topCard.style.transform =
          'translateX(-50%) translateY(-50%) rotate(0deg) rotateY(0deg) scale(1)';
        if (this.nextCard)
          this.nextCard.style.transform =
            'translateX(-50%) translateY(-50%) rotate(0deg) rotateY(0deg) scale(0.95)';
      }
    }
  }

  push(movie) {
    this.movies[movie.id] = { ...movie, expanded: false };
    const card = document.createElement('div');
    card.classList.add('card');
    card.id = movie.id;
    card.setAttribute('title', movie.title);
    this.updateCardState(card);
    if (this.board.firstChild) {
      this.board.insertBefore(card, this.board.firstChild);
    } else {
      this.board.append(card);
    }
  }

  updateCardState(card) {
    const movie = this.movies[card.id];
    if (!movie) {
      return;
    }
    const genresList = movie.genres.map(genre => genre.name).join(', ');

    const header = `<strong>${movie.title}</strong>`;

    if (movie.expanded) {
      card.style.backgroundImage = '';
      const countries = movie.countries
        .map(code => countryCodeEmoji(code))
        .join(' ');
      const tagline = `<i>${movie.tagline}</i>`;
      const genres = `<strong>Genres:</strong> ${genresList}`;
      const from = `<strong>From: ${countries}</strong>`;
      const release = `<strong>Release Date:</strong> ${movie.release_date}`;
      const runtime = `<strong>Runtime:</strong> ${movie.runtime} min`;
      const voteAverage = `<strong>Vote Average:</strong> ${movie.vote_average}`;
      const voteCount = `<strong>Vote Count:</strong> ${movie.vote_count}`;
      const data = [
        header,
        from,
        genres,
        release,
        runtime,
        voteAverage,
        voteCount,
        tagline,
        movie.overview,
      ];
      card.innerHTML = '<p>' + data.join('<br>') + '</p>';
      card.classList.add('card-expanded');
    } else {
      card.style.backgroundImage = `url('https://image.tmdb.org/t/p/w300_and_h450_bestv2${movie.poster_path}')`;
      card.innerHTML = `${header}${movie.overview.substring(0, 140)}...`;
      card.classList.remove('card-expanded');
    }
  }
}

let carousel = new Carousel(board);

// country code regex
const CC_REGEX = /^[a-z]{2}$/i;

// offset between uppercase ascii and regional indicator symbols
const OFFSET = 127397;

function countryCodeEmoji(cc) {
  if (!CC_REGEX.test(cc)) {
    const type = typeof cc;
    throw new TypeError(
      `cc argument must be an ISO 3166-1 alpha-2 string, but got '${
        type === 'string' ? cc : type
      }' instead.`,
    );
  }

  const chars = [...cc.toUpperCase()].map(c => c.charCodeAt() + OFFSET);
  return String.fromCodePoint(...chars);
}
