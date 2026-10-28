/**
 * main.jsx — indgang til Word-tilføjelsesprogrammet (word.html).
 *
 * Office.js indlæses fra Microsoft i word.html. Panelet tegnes, når Office er
 * klar -- eller med det samme, hvis siden er åbnet i en almindelig browser.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import WordApp from './WordApp.jsx'
import '../index.css'

const tegn = () => ReactDOM.createRoot(document.getElementById('root')).render(<WordApp />)

if (typeof Office !== 'undefined' && Office.onReady) Office.onReady(() => tegn())
else tegn()
