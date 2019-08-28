/**
 * ContentTranslation MediaWiki API request manager class.
 *
 * This class abstracts API requests to MediaWiki instance for title, image,
 * template and such information. The caching of such requests is taken care.
 * Pagination, request queues are also implemented. The requests will be created
 * using SiteMapper so that source wiki, target wiki API end points are correctly
 * handled.
 *
 * This abstraction also helps to write unit tests. We can mock the network requests
 * by adding entries to the cache before running tests so that the real network
 * requests won't be initiated.
 */

'use strict';

/**
 * @class
 * @param {string} sourceLanguage Language code
 * @param {string} targetLanguage Language code
 * @param {mw.cx.SiteMapper} siteMapper
 */
mw.cx.MwApiRequestManager = function MwCxMwApiRequestManager( sourceLanguage, targetLanguage, siteMapper ) {
	this.sourceLanguage = sourceLanguage;
	this.targetLanguage = targetLanguage;
	this.siteMapper = siteMapper;
	this.linkCache = {};
	this.imageCache = {};
	this.titlePairCache = {};
	this.categoryCache = {};
	this.namespaceCache = {};
	this.init();
};

/**
 * Initialize or reset all caches.
 */
mw.cx.MwApiRequestManager.prototype.init = function () {
	this.linkCache[ this.sourceLanguage ] = new mw.cx.LinkCache( {
		language: this.sourceLanguage,
		siteMapper: this.siteMapper
	} );
	this.linkCache[ this.targetLanguage ] = new mw.cx.LinkCache( {
		language: this.targetLanguage,
		siteMapper: this.siteMapper
	} );
	this.imageCache[ this.sourceLanguage ] = new mw.cx.ImageInfoCache( {
		language: this.sourceLanguage,
		siteMapper: this.siteMapper
	} );
	this.imageCache[ this.targetLanguage ] = new mw.cx.ImageInfoCache( {
		language: this.targetLanguage,
		siteMapper: this.siteMapper
	} );
	this.titlePairCache[ this.sourceLanguage ] = new mw.cx.TitlePairCache( {
		sourceLanguage: this.sourceLanguage,
		targetLanguage: this.targetLanguage,
		siteMapper: this.siteMapper
	} );
	this.titlePairCache[ this.targetLanguage ] = new mw.cx.TitlePairCache( {
		sourceLanguage: this.targetLanguage,
		targetLanguage: this.sourceLanguage,
		siteMapper: this.siteMapper
	} );
	this.categoryCache[ this.sourceLanguage ] = new mw.cx.CategoryCache( {
		language: this.sourceLanguage,
		siteMapper: this.siteMapper
	} );
	this.categoryCache[ this.targetLanguage ] = new mw.cx.CategoryCache( {
		language: this.targetLanguage,
		siteMapper: this.siteMapper
	} );
	this.namespaceCache[ this.sourceLanguage ] = new mw.cx.NamespaceCache( {
		language: this.targetLanguage,
		siteMapper: this.siteMapper
	} );
	this.namespaceCache[ this.targetLanguage ] = new mw.cx.NamespaceCache( {
		language: this.targetLanguage,
		siteMapper: this.siteMapper
	} );
};

/**
 * Look up link data about a title. If the data about this title is already in the cache, this
 * returns an already-resolved promise. Otherwise, it returns a pending promise and schedules
 * an request to retrieve the data.
 *
 * @param {string} language Language code
 * @param {string} title Title
 * @return {jQuery.Promise} Promise that will be resolved with the data once it's available
 */
mw.cx.MwApiRequestManager.prototype.getLinkInfo = function ( language, title ) {
	if ( !this.linkCache[ language ] ) {
		throw Error( '[CX] LinkCache not initialized for ' + language );
	}
	return this.linkCache[ language ].get( title );
};

/**
 * Look up image data about a title. If the data about this title is already in the cache, this
 * returns an already-resolved promise. Otherwise, it returns a pending promise and schedules
 * an request to retrieve the data.
 *
 * @param {string} language Language code
 * @param {string} title Title
 * @return {jQuery.Promise} Promise that will be resolved with the data once it's available
 */
mw.cx.MwApiRequestManager.prototype.getImageInfo = function ( language, title ) {
	if ( !this.imageCache[ language ] ) {
		throw Error( '[CX] ImageCache not initialized for ' + language );
	}
	return this.imageCache[ language ].get( title );
};

/**
 * Look up pairing data about a title. If the data about this title is already in the cache, this
 * returns an already-resolved promise. Otherwise, it returns a pending promise and schedules
 * an request to retrieve the data.
 *
 * @param {string} language Language code
 * @param {string} title Title
 * @return {jQuery.Promise} Promise that will be resolved with the data once it's available
 */
mw.cx.MwApiRequestManager.prototype.getTitlePair = function ( language, title ) {
	if ( !this.titlePairCache[ language ] ) {
		throw Error( '[CX] TitlePairCache not initialized for ' + language );
	}
	return this.titlePairCache[ language ].get( title );
};

/**
 * @param {string} language Language code
 * @param {string} title Title
 * @return {jQuery.Promise} Promise that will be resolved with the data once it's available
 */
mw.cx.MwApiRequestManager.prototype.getCategories = function ( language, title ) {
	if ( !this.categoryCache[ language ] ) {
		throw Error( '[CX] CategoryCache not initialized for ' + language );
	}
	return this.categoryCache[ language ].get( title );
};

/**
 * @param {string} language Language code
 * @param {string} canonicalNamespace Canonical namespace
 * @return {jQuery.Promise} Promise that will be resolved with the data once it's available
 */
mw.cx.MwApiRequestManager.prototype.getNamespaceAlias = function ( language, canonicalNamespace ) {
	if ( !this.namespaceCache[ language ] ) {
		throw Error( '[CX] namespaceCache not initialized for ' + language );
	}
	return this.namespaceCache[ language ].get( canonicalNamespace );
};

/**
 * Fetch CX Language pair configuration
 * @param {string} sourceLanguage Source language
 * @param {string} targetLanguage Target language
 * @return {jQuery.Promise}
 */
mw.cx.MwApiRequestManager.prototype.fetchCXConfiguration = function ( sourceLanguage, targetLanguage ) {
	return new mw.Api().get( {
		action: 'cxconfiguration',
		from: sourceLanguage,
		to: targetLanguage
	} );
};

/**
 * Fetch the page with given title and language.
 * Response contains
 *
 * @param {string} title Title of the page to be fetched
 * @param {string} language Language of the page requested. This will be used to
 *     identify the host wiki.
 * @param {string} revision Source page revision id.
 * @return {jQuery.Promise}
 */
mw.cx.MwApiRequestManager.prototype.fetchSourcePageContent = function ( title, language, revision ) {
	var fetchParams, apiURL, fetchPageUrl;

	fetchParams = {
		$language: this.siteMapper.getWikiDomainCode( language ),
		// Manual normalisation to avoid redirects on spaces but not to break namespaces
		$title: title.replace( / /g, '_' )
	};
	apiURL = '/page/$language/$title';

	// If revision is requested, load that revision of page.
	if ( revision ) {
		fetchParams.$revision = revision;
		apiURL += '/$revision';
	}

	fetchPageUrl = this.siteMapper.getCXServerUrl( apiURL, fetchParams );

	return $.get( fetchPageUrl ).fail( function ( xhr ) {
		if ( xhr.status === 404 ) {
			mw.hook( 'mw.cx.error' ).fire(
				mw.msg( 'cx-error-page-not-found', title, $.uls.data.getAutonym( language ) )
			);
		} else {
			mw.hook( 'mw.cx.error' ).fire( mw.msg( 'cx-error-server-connection' ) );
		}
	} );
};
