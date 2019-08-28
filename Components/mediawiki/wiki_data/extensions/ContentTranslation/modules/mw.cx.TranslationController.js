/**
 * CX Translation - save, fetch controller
 *
 * @param {mw.cx.dm.Translation} translation
 * @param {ve.init.mw.CXTarget} veTarget
 * @param {object} config Translation configuration
 */
mw.cx.TranslationController = function MwCxTranslationController( translation, veTarget, config ) {
	this.translation = translation;
	this.veTarget = veTarget;
	this.config = config;
	this.siteMapper = config.siteMapper;
	this.sourceTitle = config.sourceTitle;
	this.sourceLanguage = config.sourceLanguage;
	this.targetLanguage = config.targetLanguage;
	this.translationView = this.veTarget.translationView;
	// Mixin constructors
	OO.EventEmitter.call( this );
	// Properties
	this.translationId = null;
	this.saveRequest = null;
	this.failCounter = 0;
	this.isFailedUnrecoverably = false; // TODO: This is still unused
	// Associative array of translation units queued to be saved
	this.saveQueue = {};
	this.saveTimer = null;
	this.targetTitleChanged = false;
	this.schedule = OO.ui.throttle( this.processSaveQueue.bind( this ), 15 * 1000 );
	this.targetArticle = new mw.cx.TargetArticle( this.translation, this.veTarget, this.config );
	this.listen();
};

/* Inheritance */

OO.mixinClass( mw.cx.TranslationController, OO.EventEmitter );

mw.cx.TranslationController.prototype.listen = function () {
	this.veTarget.connect( this, {
		saveSection: 'save',
		publish: 'publish',
		targetTitleChange: 'onTargetTitleChange'
	} );

	this.targetArticle.connect( this, {
		publishCancel: 'onPublishCancel',
		publishSuccess: 'onPublishSuccess',
		publishError: 'onPublishFailure'
	} );

	// Save when CTRL+S is pressed.
	// TODO: This should use VE's Trigger/Command system, and be registered with the help dialog
	document.onkeydown = function ( e ) {
		// See https://medium.com/medium-eng/the-curious-case-of-disappearing-polish-s-fa398313d4df
		if ( ( e.metaKey || e.ctrlKey && !e.altKey ) && e.which === 83 ) {
			this.processSaveQueue();
			return false;
		}
	}.bind( this );

	window.onbeforeunload = this.onPageUnload.bind( this );
};

ve.ui.commandHelpRegistry.register( 'other', 'autoSave', {
	shortcuts: [ {
		mac: 'cmd+s',
		pc: 'ctrl+s'
	} ],
	label: OO.ui.deferMsg( 'cx-save-draft-shortcut-label' )
} );

/**
 * Save the translation to database
 * @param {Object} sectionData
 */
mw.cx.TranslationController.prototype.save = function ( sectionData ) {
	if ( !sectionData ) {
		return;
	}

	// Keep records keyed by section numbers to avoid duplicates.
	// When more than one changes to a single translation unit comes, only
	// the last one need to consider for saving.
	this.saveQueue[ sectionData.sectionNumber ] = sectionData;

	this.schedule();
};

/**
 * Process the save queue. Save the changed translation units.
 * @param {boolean} [isRetry] Whether this is a retry or not
 * @fires savestart
 * @fires saveerror
 */
mw.cx.TranslationController.prototype.processSaveQueue = function ( isRetry ) {
	var params,
		api = new mw.Api();

	if ( ( !this.saveQueue || !Object.keys( this.saveQueue ).length ) && !this.targetTitleChanged ) {
		return;
	}

	if ( this.failCounter > 0 && isRetry !== true ) {
		// Last save failed, and a retry has been scheduled. Don't allow starting new
		// save requests to avoid overloading the servers, unless this is the retry.
		mw.log( '[CX] Save request skipped because a retry has been scheduled' );
		return;
	}

	// Starting the real save API call. Fire event so that we can show a progress
	// indicator in UI.
	this.emit( 'savestart' );
	this.translationView.setStatusMessage( mw.msg( 'cx-save-draft-saving' ) );
	if ( this.saveRequest ) {
		mw.log( '[CX] Aborted active save request' );
		// This causes failCounter to increase because the in-flight request fails.
		// The new request we do below will either reset the fail counter on success.
		// If it does not succeed, the retry timer that was set by the failed request
		// prevents further saves before the retry has completed successfully or given up.
		this.saveRequest.abort();
	}

	params = {
		action: 'cxsave',
		assert: 'user',
		content: this.getContentToSave( this.saveQueue ),
		from: this.sourceLanguage,
		to: this.targetLanguage,
		sourcetitle: this.sourceTitle,
		title: this.translation.getTargetTitle(),
		sourcerevision: this.translation.sourceRevisionId,
		progress: JSON.stringify( this.translation.getProgress() ),
		cxversion: 2
	};

	if ( this.failCounter > 0 ) {
		mw.log( '[CX] Retrying to save the translation. Failed ' + this.failCounter + ' times so far.' );
	}
	this.saveRequest = api.postWithToken( 'csrf', params )
		.done( function ( saveResult ) {
			this.onSaveComplete( saveResult );

			// Reset fail counter.
			if ( this.failCounter > 0 ) {
				this.failCounter = 0;
				this.schedule = OO.ui.throttle( this.processSaveQueue.bind( this ), 15 * 1000 );
				mw.log( '[CX] Retry successful. Save succeeded.' );
			}
		}.bind( this ) ).fail( function ( errorCode, details ) {
			var delay;
			this.failCounter++;

			mw.log.warn( '[CX] Saving Failed. Error code: ' + errorCode );
			if ( details.exception !== 'abort' ) {
				this.onSaveFailure( errorCode, details );
			}

			if ( this.failCounter > 5 ) {
				// If there are more than a few errors, stop autosave at timer triggers.
				// Show a bigger error message at this point.
				this.translationView.showMessage( 'error', mw.msg( 'cx-save-draft-error' ) );
				// This will allow any change to trigger save again
				this.failCounter = 0;
				mw.log.error( '[CX] Saving failed repeatedly. Stopping retries.' );
			} else {
				// Delay in seconds, failCounter is [1,5]
				delay = 60 * this.failCounter;
				// Schedule retry.
				setTimeout( this.processSaveQueue.bind( this, true ), delay * 1000 );
				mw.log( '[CX] Retry scheduled in ' + delay / 60 + ' minutes.' );
			}
		}.bind( this ) ).always( function () {
			this.saveRequest = null;
		}.bind( this ) );
};

/**
 * Find out if there is any "dirty" section translation units
 * Inform about sections not saved to the user.
 * @return {string|undefined} The message to be shown to user
 */
mw.cx.TranslationController.prototype.onPageUnload = function () {
	if ( this.saveQueue.length ) {
		this.schedule();
		return mw.msg( 'cx-warning-unsaved-translation' );
	}
};

mw.cx.TranslationController.prototype.onSaveComplete = function ( saveResult ) {
	var sectionNumber, minutes = 0;

	if ( this.targetTitleChanged ) {
		mw.log( '[CX] Target title saved.' );
	}
	this.targetTitleChanged = false;

	this.translationId = saveResult.cxsave.translationid;
	for ( sectionNumber in this.saveQueue ) {
		if ( this.saveQueue.hasOwnProperty( sectionNumber ) ) {
			mw.log( '[CX] Section ' + sectionNumber + ' saved.' );
			// Annotate the section with errors.
			// if ( validations[ sectionId ] && Object.keys( validations[ sectionId ] ).length ) {
			// cxsave API will return errors from abusefilter validations, if any.
			// We need to set this in translation unit model. A tool attached to UI model
			// can query the model to see if there is any error and show in tools(on focus
			// of translation unit)
		}
	}

	this.emit( 'savesuccess' );
	// Show saved status with a time after last save.
	clearTimeout( this.saveTimer );
	this.translationView.setStatusMessage( mw.msg( 'cx-save-draft-save-success', 0 ) );
	this.saveTimer = setInterval( function () {
		if ( this.failCounter > 0 ) {
			// Don't overwrite error message of failure with this timer controlled message.
			return;
		}
		minutes++;
		this.translationView.setStatusMessage(
			mw.msg( 'cx-save-draft-save-success', mw.language.convertNumber( minutes ) )
		);
	}.bind( this ), 60 * 1000 );

	// Reset the queue
	this.saveQueue = [];
};

mw.cx.TranslationController.prototype.onSaveFailure = function ( errorCode, details ) {
	if ( errorCode === 'assertuserfailed' ) {
		this.translationView.showMessage( 'error', mw.msg( 'cx-lost-session-draft' ) );
	}

	if ( details && details.exception instanceof Error ) {
		details.exception = details.exception.toString();
		details.errorCode = errorCode;
	}
	this.emit( 'saveerror' );
	this.translationView.setStatusMessage( mw.msg( 'cx-save-draft-error' ) );
};

/**
 * Get the deflated content to save from save queue
 * @param {Object[]} saveQueue
 * @return {string}
 */
mw.cx.TranslationController.prototype.getContentToSave = function ( saveQueue ) {
	var records = [];

	Object.keys( saveQueue ).forEach( function ( key ) {
		var translationUnit = saveQueue[ key ];
		this.getSectionRecords( translationUnit ).forEach( function ( data ) {
			records.push( data );
		} );
	}.bind( this ) );
	// The cxsave api accept non-deflated content too.
	// Sometimes it is helpful for testing:
	// return JSON.stringify( records );
	return EasyDeflate.deflate( JSON.stringify( records ) );
};

/**
 * Get the records for saving the translation unit.
 * @param {Object} sectionData
 * @return {Object[]} Objects to save
 */
mw.cx.TranslationController.prototype.getSectionRecords = function ( sectionData ) {
	var origin, translationSource, records = [],
		validate;

	// XXX Section validation for abusefilter
	validate = false;

	// XXX should use the promise, but at this point the member variable should always be present
	translationSource = sectionData.translation.MTProvider;
	if ( translationSource === 'source' || translationSource === 'scratch' ) {
		origin = 'user';
	} else {
		origin = translationSource;
	}

	records.push( {
		content: sectionData.translation.content,
		sectionId: sectionData.sectionNumber, // source section id is the canonical section id.
		validate: validate,
		origin: origin
	} );
	// XXX: Source sections are saved only once.
	records.push( {
		content: sectionData.source.content,
		sectionId: sectionData.sectionNumber,
		validate: false,
		origin: 'source'
	} );
	return records;
};

/**
 * Publish the translation
 */
mw.cx.TranslationController.prototype.publish = function () {
	mw.log( '[CX] Publishing translation...' );

	// Clear the status message
	this.translationView.setStatusMessage( '' );
	this.translationView.categoryUI.disableCategoryUI( true );

	this.targetArticle.publish();
	// Scroll to the top of the page, so success/fail messages become visible
	$( 'html, body' ).animate( { scrollTop: 0 }, 'fast' );
};

mw.cx.TranslationController.prototype.enableEditing = function () {
	this.translationView.categoryUI.disableCategoryUI( false );
	clearTimeout( this.saveTimer );
};

/**
 * Publish cancel handler
 */
mw.cx.TranslationController.prototype.onPublishCancel = function () {
	mw.log( '[CX] Publishing canceled' );

	this.veTarget.onPublishCancel();
	this.enableEditing();
};

/**
 * Publish success handler
 */
mw.cx.TranslationController.prototype.onPublishSuccess = function () {
	mw.log( '[CX] Publishing finished successfully' );

	this.veTarget.onPublishSuccess( this.targetArticle.getTargetURL() );
	this.enableEditing();

	// Event logging
	mw.hook( 'mw.cx.translation.published' ).fire(
		this.translation.sourceLanguage,
		this.translation.targetLanguage,
		this.translation.sourceTitle,
		this.translation.targetTitle
	);
};

/**
 * Publish error handler
 *
 * @param {OO.ui.Error} error
 */
mw.cx.TranslationController.prototype.onPublishFailure = function ( error ) {
	this.isFailedUnrecoverably = !error.isRecoverable();
	this.veTarget.onPublishFailure( error.getMessageText() );
	this.enableEditing();
};

/**
 * Target title change handler
 */
mw.cx.TranslationController.prototype.onTargetTitleChange = function () {
	var currentTitleObj, newTitleObj,
		newTitle = this.translationView.targetColumn.getTitle();

	if ( this.translation.getTargetTitle() === newTitle ) {
		// Nothing really changed.
		return;
	}

	this.targetTitleChanged = true;

	newTitleObj = mw.Title.newFromText( newTitle );
	if ( !newTitleObj ) {
		mw.log.error( '[CX] Invalid target title' );
		return;
	}
	currentTitleObj = mw.Title.newFromText( this.translation.getTargetTitle() );
	this.translation.setTargetTitle( newTitle );

	if ( currentTitleObj.getNamespaceId() !== newTitleObj.getNamespaceId() ) {
		this.veTarget.updateNamespace();
	}

	this.schedule();
};
