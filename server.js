const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse incoming requests with JSON payloads (up to 10MB for images)
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Supabase using environment variables hidden on Render
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Secure Endpoint: Receives image data, handles storage upload
app.post('/api/verify-identity', async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ status: 'error', message: 'Verification missing.' });
        }

        // Clean the base64 string provided by the canvas
        const base64Data = image.replace(/^data:image\/jpeg;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        const fileName = `verification_${Date.now()}.jpg`;

        // 1. Upload raw binary buffer to your Supabase Bucket
        const { data: storageData, error: storageError } = await supabase.storage
            .from('user-photos')
            .upload(fileName, buffer, {
                contentType: 'image/jpeg',
                upsert: false
            });

        if (storageError) throw storageError;

        // 2. Fetch the newly created item's public URL 
        const { data: urlData } = supabase.storage
            .from('user-photos')
            .getPublicUrl(fileName);

        // 3. Insert metadata record into the Database table
        const { error: dbError } = await supabase
            .from('user_metadata')
            .insert([{ photo_url: urlData.publicUrl }]);

        if (dbError) throw dbError;

        // Respond with standard verification success message
        return res.json({ status: 'success', message: 'Identity confirmed.' });

    } catch (error) {
        console.error('Processing error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Processing failed.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server executing securely on port ${PORT}`);
});
