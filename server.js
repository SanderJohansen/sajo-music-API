const express = require('express');
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = 3000;

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
        ca: fs.readFileSync(process.env.DB_SSL_CA)  // Make sure this path is correct and the file is accessible
    }
});

app.get('/api/search/album/:name', async (req, res) => {
    try {
        const name = req.params.name;

        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Search for albums by name
        const [albums] = await connection.query('SELECT * FROM Albums WHERE name LIKE ?', [`%${name}%`]);

        // Release the connection
        connection.release();

        res.send(albums);
    } catch (error) {
        console.error('Error occurred while searching for albums:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/search/artist/:name', async (req, res) => {
    try {
        const name = req.params.name;

        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Search for artists by name
        const [artists] = await connection.query('SELECT * FROM Artists WHERE name LIKE ?', [`%${name}%`]);

        // Release the connection
        connection.release();

        res.send(artists);
    } catch (error) {
        console.error('Error occurred while searching for artists:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/search/track/:name', async (req, res) => {
    try {
        const name = req.params.name;

        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Search for tracks by name
        const [tracks] = await connection.query('SELECT * FROM Tracks WHERE name LIKE ?', [`%${name}%`]);

        // Release the connection
        connection.release();

        res.send(tracks);
    } catch (error) {
        console.error('Error occurred while searching for tracks:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/search/:query', async (req, res) => {
    try {
        const query = req.params.query;

        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Search for albums, artists, and tracks by name
        const [albums] = await connection.query('SELECT * FROM Albums WHERE name LIKE ?', [`%${query}%`]);
        const [artists] = await connection.query('SELECT * FROM Artists WHERE name LIKE ?', [`%${query}%`]);
        const [tracks] = await connection.query('SELECT * FROM Tracks WHERE name LIKE ?', [`%${query}%`]);

        // Release the connection
        connection.release();

        res.send({ albums, artists, tracks });
    } catch (error) {
        console.error('Error occurred while searching:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/albums', async (req, res) => {
    try {
        const connection = await pool.getConnection(); // Ensure pool is defined and accessible here
        const [rows] = await connection.query('SELECT * FROM Albums');
        connection.release();
        res.json(rows);
    } catch (err) {
        console.log(pool);  // This will print the pool object to the console, ensuring it’s defined
        console.error('Error querying the database', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/albums', async (req, res) => {
    try {
        const { artist, album, tracks } = req.body;

        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Begin transaction
        await connection.beginTransaction();

        // Check if the artist exists
        const [existingArtist] = await connection.query('SELECT * FROM Artists WHERE name = ?', [artist.name]);

        let artistId;
        if (existingArtist.length === 0) {
            // Create a new artist if not exists
            const [result] = await connection.execute('INSERT INTO Artists (name, country) VALUES (?, ?)', [artist.name, artist.country]);
            artistId = result.insertId;
        } else {
            artistId = existingArtist[0].artist_id;
        }

        // Create a new album
        const [albumResult] = await connection.execute('INSERT INTO Albums (name, release_date, album_type) VALUES (?, ?, ?)', [album.name, album.releaseDate, album.type]);
        const albumId = albumResult.insertId;

        // Insert artist and album association
        await connection.execute('INSERT INTO AlbumArtists (album_id, artist_id) VALUES (?, ?)', [albumId, artistId]);

        // Insert tracks and their association with the album
        for (const track of tracks) {
            const [trackResult] = await connection.execute('INSERT INTO Tracks (name, duration_seconds) VALUES (?, ?)', [track.name, track.duration]);
            await connection.execute('INSERT INTO AlbumTracks (album_id, track_id, is_bonus_track) VALUES (?, ?, ?)', [albumId, trackResult.insertId, track.isBonusTrack || false]);
        }

        // Commit the transaction
        await connection.commit();

        // Release the connection
        connection.release();

        res.status(201).send({ message: 'Album, artist, and tracks created successfully!', albumId });
    } catch (error) {
        await connection.rollback(); // This undoes all changes made during the transaction
        console.error('An error occurred while creating the album:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/albums/:name', async (req, res) => {
    try {
        const name = req.params.name;

        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Get album information
        const [albums] = await connection.query('SELECT * FROM Albums WHERE name LIKE ?', [`%${name}%`]);

        if (albums.length === 0) {
            connection.release();
            return res.status(404).send({ message: 'Album not found' });
        }

        // If you want to send all matching albums
        const detailedAlbums = await Promise.all(albums.map(async album => {
            const albumId = album.album_id;
            // Get artist information
            const [artists] = await connection.query('SELECT * FROM Artists WHERE artist_id IN (SELECT artist_id FROM AlbumArtists WHERE album_id = ?)', [albumId]);
            album.artist = artists;

            // Get tracks information
            const [tracks] = await connection.query('SELECT * FROM Tracks WHERE track_id IN (SELECT track_id FROM AlbumTracks WHERE album_id = ?)', [albumId]);
            album.tracks = tracks;
            
            return album;
        }));

        // Release the connection
        connection.release();

        res.send(detailedAlbums);
    } catch (error) {
        console.error('An error occurred while retrieving the album data:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
