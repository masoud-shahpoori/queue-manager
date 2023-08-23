import React from 'react';
import logo from './logo.svg';
import './App.css';
import {QueuePending} from "./queu-handler/queue.pending";
import {DownloadQueueFacade} from "./queu-handler/download.queue.facade";

function App() {
    const item = DownloadQueueFacade.getInstance()


    return (
        <div className="App">
            <button onClick={() => {
                item.sendToPending(Math.ceil(Math.random() * 100).toString())
            }}>add to pending
            </button>

            <button onClick={() => {
                console.log('getPending', item.getPending())
            }}>get pending
            </button>


            <button onClick={() => {
                item.sendToProgress()
            }
            }>send to progress
            </button>


            <button onClick={() => {
                console.log('getProgress', item.getProgress())
            }
            }>get progress
            </button>

            <button onClick={() => {
                item.sendToDownload()
            }
            }>send to download
            </button>


            <button onClick={() => {
                console.log('getDownloaded', item.getDownloaded())
            }
            }>getDownloaded
            </button>

        </div>
    );
}

export default App;
