const { app, BrowserWindow } = require('electron');
const path = require('path');
const fetch = require('node-fetch'); // Certifique-se de instalar: npm install node-fetch@2

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'seq.png.jpg') // Ajuste o nome/caminho do seu PNG aqui
    });

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Função para remasterizar com Auphonic (backend)
async function remasterAudio(audioBlob) {
    const apiKey = 'Z5W6hVd9N8Zzlj06P7H7d8Z6ktWl9sB9'; // Substitua pelo seu token real da Auphonic
    try {
        const productionData = {
            "title": "Remasterização Automática",
            "output_files": [{ "format": "wav" }],
            "algorithms": {
                "loudnesstarget": -16,
                "leveler": true,
                "denoise": true,
                "hiss": true,
                "filter": true
            }
        };

        const createResponse = await fetch('https://auphonic.com/api/productions.json', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productionData)
        });

        if (!createResponse.ok) throw new Error('Erro na criação da produção');
        const createResult = await createResponse.json();
        const productionUuid = createResult.data.uuid;

        const uploadFormData = new FormData();
        uploadFormData.append('input_file', audioBlob, 'audio_to_remaster.wav');

        const uploadResponse = await fetch(`https://auphonic.com/api/production/${productionUuid}/upload.json`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: uploadFormData
        });

        if (!uploadResponse.ok) throw new Error('Erro no upload');

        const startResponse = await fetch(`https://auphonic.com/api/production/${productionUuid}/start.json`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!startResponse.ok) throw new Error('Erro ao iniciar');

        let status = 'Processing';
        while (status === 'Processing' || status === 'Waiting' || status === 'Audio Processing') {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const statusResponse = await fetch(`https://auphonic.com/api/production/${productionUuid}.json`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            const statusData = await statusResponse.json();
            status = statusData.data.status_string;
        }

        if (status === 'Done') {
            const downloadUrl = statusData.data.output_files[0].download_url;
            const response = await fetch(downloadUrl);
            return await response.buffer(); // Retorna o arquivo remasterizado como Buffer
        } else {
            throw new Error('Processamento falhou');
        }
    } catch (err) {
        console.error('Erro ao remasterizar:', err);
        throw err;
    }
}

// Comunicação entre frontend e backend
const { ipcMain } = require('electron');
ipcMain.on('remaster-audio', async (event, audioData) => {
    try {
        const remasteredBuffer = await remasterAudio(Buffer.from(audioData));
        event.reply('remaster-audio-reply', remasteredBuffer);
    } catch (err) {
        event.reply('remaster-audio-reply', { error: err.message });
    }
});
