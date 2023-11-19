const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc } = require('firebase/firestore');
const express = require('express'); const axios = require('axios');
const path = require('path');

const firebaseConfig = {
  apiKey: "AIzaSyC6jKXn3yUfg6dvb4VAIRg6WHUZrz1hmwE",
  authDomain: "movie-recommender-4aaf3.firebaseapp.com",
  projectId: "movie-recommender-4aaf3",
  storageBucket: "movie-recommender-4aaf3.appspot.com",
  messagingSenderId: "291578402186",
  appId: "1:291578402186:web:93458a995943cbb5906473",
  measurementId: "G-J808HK9372"
};
// Initialize Firebase app
const firebaseApp = initializeApp(firebaseConfig);
// Explicitly specify Firestore
const db = getFirestore(firebaseApp);
// Reference to the movies collection
const moviesCollection = collection(db, 'movies');
const app = express();
const port = 3000;
const tmdbKey = '057169d78f8dfa423332ac53b6ad73ef';
const tmdbBaseUrl = 'https://api.themoviedb.org/3/';
app.use(express.static(__dirname + '/public'));
app.use(express.json())
// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/getGenres', async (req, res) => {
  try {
    const genreRequestEndpoint = 'genre/movie/list';
    const requestParams = `?api_key=${tmdbKey}`;
    const urlToFetch = tmdbBaseUrl + genreRequestEndpoint + requestParams;
    const response = await axios.get(urlToFetch);
    res.json(response.data.genres);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});
app.get('/getMovies/:genreId', async (req, res) => {
  try {
    const selectedGenre = req.params.genreId;
    // Check rate limit before making the API call 
    const rateLimitResult = await checkRateLimit(selectedGenre);
    if (rateLimitResult.allowed) { // Make an API call to fetch recommendations from the third-party service
      const discoverMovieEndpoint = 'discover/movie';
      const requestParams = `?api_key=${tmdbKey}&with_genres=${selectedGenre}`;
      const urlToFetch = tmdbBaseUrl + discoverMovieEndpoint + requestParams;
      const response = await axios.get(urlToFetch);
      const movies = response.data.results;
      const randomMovie = getRandomMovie(movies);
      // Update rate limit information after a successful API call
      await updateRateLimit(selectedGenre, rateLimitResult.apiCallCount + 1);
      // Store movie recommendation in Firebase 
      await storeMovieRecommendation(selectedGenre, randomMovie);
      // Send the movie data as a response 
      res.json(randomMovie);
    }
    else { // Fetch recommendations from the Firebase collection 
      const cachedRecommendation = await getCachedRecommendation(selectedGenre);
      console.log(rateLimitResult.message);
      if (cachedRecommendation) {
        // Use cached recommendations
        res.json(cachedRecommendation);
      } else { // Handle the case where there are no cached recommendations 
        res.status(404).send('No recommendations available.');
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});
// Helper function to check rate limit before making an API call
async function checkRateLimit(genreId) {
  try {
    const genreDocRef = doc(moviesCollection, genreId);
    const genreDoc = await getDoc(genreDocRef);
    if (genreDoc.exists()) {
      const lastTimestamp = genreDoc.data().timestamp;
      const currentTime = Date.now(); const timeWindow = 2 * 60 * 1000; // 2 minutes 
      const maxApiCalls = 5;
      if (currentTime - lastTimestamp < timeWindow) {
        const apiCallCount = genreDoc.data().apiCallCount || 0;
        if (apiCallCount < maxApiCalls) {
          return { allowed: true, apiCallCount };
        } else {
          return { allowed: false, message: 'Rate limit exceeded. Using cached recommendations.' };
        }
      }
    }
  } catch (error) { console.error('Error checking rate limit:', error); }
  return { allowed: true, apiCallCount: 0 };
}
// Helper function to update rate limit information after making an API call
async function updateRateLimit(genreId, apiCallCount) {
  const currentTime = Date.now();
  try {
    await setDoc(doc(moviesCollection, genreId), { apiCallCount, timestamp: currentTime, });
  } catch (error) {
    console.error('Error updating rate limit:', error);
  }
}
// Helper function to store movie recommendation in Firebase
async function storeMovieRecommendation(genreId, movieInfo) {
  try {
    const recommendationsCollection = collection(doc(moviesCollection, genreId), 'recommendations');
    await addDoc(recommendationsCollection, movieInfo);
  } catch (error) {
    console.error('Error storing movie recommendation:', error);
  }
}
// Helper function to get cached movie recommendation from Firebase
async function getCachedRecommendation(genreId) {
  try {
    const recommendationsCollection = collection(doc(moviesCollection, genreId), 'recommendations');
    const snapshot = await getDocs(recommendationsCollection);
    if (!snapshot.empty) {
      const randomIndex = Math.floor(Math.random() * snapshot.docs.length);
      const cachedRecommendation = snapshot.docs[randomIndex].data();
      return cachedRecommendation;
    }
  } catch (error) {
    console.error('Error getting cached recommendation:', error);
  }
  return null;
}
// Helper function to get a random movie from an array of movies
function getRandomMovie(movies) {
  const randomIndex = Math.floor(Math.random() * movies.length);
  const randomMovie = movies[randomIndex];
  return randomMovie;
}
app.listen(port, () => { console.log(`Server is running on http://localhost:${port}`); });
