/*!
 * ContentTranslation extension
 * A tool that allows editors to translate pages from one language
 * to another with the help of machine translation and other translation
 *
 * @copyright See AUTHORS.txt
 * @license GPL-2.0-or-later
 */
( function ( $, mw ) {
	'use strict';

	/**
	 * Handles providing URLs to different wikis.
	 *
	 * @class
	 * @param {Object} siteconfig
	 */
	mw.cx.SiteMapper = function ( siteconfig ) {
		this.config = siteconfig;
		this.languagePairsPromise = null;
	};

	/**
	 * Some wikis have domain names that do not match the content language.
	 * See: wgLanguageCode in operations/mediawiki-config/wmf-config/InitialiseSettings.php
	 *
	 * @param {string} language Language code
	 * @return {string}
	 */
	mw.cx.SiteMapper.prototype.getWikiDomainCode = function ( language ) {
		var languageToWikiDomainMapping = mw.config.get( 'wgContentTranslationDomainCodeMapping' );

		return languageToWikiDomainMapping[ language ] || language;
	};

	mw.cx.SiteMapper.prototype.getLanguageCodeForWikiDomain = function ( domain ) {
		var code,
			mapping = mw.config.get( 'wgContentTranslationDomainCodeMapping' );

		$.each( mapping, function ( propertyName, valueOfProperty ) {
			if ( domain === valueOfProperty ) {
				code = propertyName;
				return false;
			}
		} );

		return code || domain;
	};

	/**
	 * Get the API for a remote wiki.
	 *
	 * @param {string} language Language code
	 * @return {mw.ForeignApi} api
	 */
	mw.cx.SiteMapper.prototype.getApi = function ( language ) {
		var url, domain;

		domain = this.getWikiDomainCode( language );
		url = this.config.api.replace( '$1', domain );

		return new mw.ForeignApi( url, {
			anonymous: true
		} );
	};

	/**
	 * Get a URL to an article in a wiki for a given language.
	 *
	 * @param {string} language Language code
	 * @param {string} title Page title
	 * @param {Object} [params] Query parameters
	 * @return {string}
	 */
	mw.cx.SiteMapper.prototype.getPageUrl = function ( language, title, params ) {
		var domain,
			base = this.config.view,
			extra = '';

		domain = this.getWikiDomainCode( language );
		if ( params && !$.isEmptyObject( params ) ) {
			base = this.config.action || this.config.view;
			extra = ( base.indexOf( '?' ) !== -1 ? '&' : '?' ) + $.param( params );
		}

		return base
			.replace( '$1', domain.replace( /\$/g, '$$$$' ) )
			.replace( '$2', mw.util.wikiUrlencode( title ).replace( /\$/g, '$$$$' ) ) + extra;
	};

	/**
	 * Get the cxserver URL for the current site.
	 *
	 * @param {string} module CXServer module path
	 * @param {Object} [params]
	 * @return {string}
	 */
	mw.cx.SiteMapper.prototype.getCXServerUrl = function ( module, params ) {
		var cxserverURL = this.config.cx;
		if ( params !== undefined ) {
			$.each( params, function ( key, value ) {
				module = module.replace( key, encodeURIComponent( value ) );
			} );
		}

		if ( mw.cx.getCXVersion() === 2 ) {
			cxserverURL = cxserverURL.replace( 'v1', 'v2' );
		}

		return cxserverURL + module;
	};

	mw.cx.SiteMapper.prototype.getRestbaseUrl = function ( language, module, params ) {
		var domain, url;

		domain = this.getWikiDomainCode( language );
		url = this.config.restbase.replace( '$1', domain );
		if ( params !== undefined ) {
			$.each( params, function ( key, value ) {
				module = module.replace( key, encodeURIComponent( value ) );
			} );
		}

		return url + module;
	};

	/**
	 * Get the target title to publish based on the wiki configuration.
	 *
	 * @param {string} title
	 * @return {string} target title
	 */
	mw.cx.SiteMapper.prototype.getTargetTitle = function ( title ) {
		var targetTitle, targetNamespace;

		// If the title is already in the user namespace, just return it
		if ( new mw.Title( title ).getNamespaceId() === 2 ) {
			return title;
		}

		targetNamespace = mw.config.get( 'wgContentTranslationTargetNamespace' );
		switch ( targetNamespace ) {
			// Main namespace
			case 0:
				targetTitle = title;
				break;
			// User
			case 2:
				targetTitle = 'User:' + mw.user.getName() + '/' + title;
				break;
			default:
				targetTitle = mw.Title.makeTitle( targetNamespace, title ).getPrefixedText();
				break;
		}

		return targetTitle;
	};

	/**
	 * Get all the source and target languages.
	 *
	 * @return {jQuery.Promise}
	 */
	mw.cx.SiteMapper.prototype.getLanguagePairs = function () {
		var languagePairsAPIUrl,
			self = this;

		if ( !this.languagePairsPromise ) {
			languagePairsAPIUrl = this.getCXServerUrl( '/list/languagepairs' );
			this.languagePairsPromise = $.get( languagePairsAPIUrl )
				.then( function ( response ) {
					return {
						targetLanguages: response.target,
						sourceLanguages: response.source
					};
				}, function ( response ) {
					mw.log(
						'Error getting language pairs from ' + languagePairsAPIUrl + ' . ' +
						response.statusText + ' (' + response.status + '). ' +
						response.responseText
					);
					self.languagePairsPromise = null;
					return $.Deferred().reject().promise();
				} );
		}
		return this.languagePairsPromise;
	};

	/**
	 * Get the URL for Special:CX on the needed wiki
	 * according to given source and target title and the target language.
	 *
	 * @param {string} sourceTitle
	 * @param {string} targetTitle
	 * @param {string} sourceLanguage
	 * @param {string} targetLanguage
	 * @param {Object} [extra] Additional query parameters
	 * @return {string} URL
	 */
	mw.cx.SiteMapper.prototype.getCXUrl = function (
		sourceTitle,
		targetTitle,
		sourceLanguage,
		targetLanguage,
		extra
	) {
		var cxPage, queryParams, uri;

		cxPage = 'Special:ContentTranslation';
		queryParams = $.extend( {
			page: sourceTitle,
			from: sourceLanguage,
			to: targetLanguage,
			targettitle: targetTitle
		}, extra );

		if ( mw.config.get( 'wgContentTranslationTranslateInTarget' ) ) {
			uri = new mw.Uri( this.getPageUrl( targetLanguage, cxPage ) );
			// Use mw.Uri().query for current URL also to retain any non-CX params
			// in URL. A good example is debug=true param.
			$.extend( uri.query, mw.Uri().query, queryParams );

			return uri.toString();
		}

		return mw.util.getUrl( cxPage, queryParams );
	};

	/**
	 * Set CX Token in a cookie.
	 * This token guarantees that the translator reads the license agreement
	 * and starts translating from CX dashboard enabled as beta feature.
	 * It is recommended to configure the cookie domain.
	 *
	 * @param {string} sourceLanguage Source language
	 * @param {string} targetLanguage Target language
	 * @param {string} sourceTitle Source title
	 */
	mw.cx.SiteMapper.prototype.setCXToken = function ( sourceLanguage, targetLanguage, sourceTitle ) {
		var name, options;

		name = [ 'cx', sourceTitle, sourceLanguage, targetLanguage ].join( '_' );

		options = {
			prefix: '',
			expires: 3600
		};

		// BC with old default behavior
		if ( this.config.cookieDomain === null ) {
			// Save that information in a domain cookie.
			options.domain = location.hostname.indexOf( '.' ) > 0 ?
				'.' + location.hostname.split( '.' ).splice( 1 ).join( '.' ) :
				null; // Mostly for domains like "localhost"
		} else if ( typeof this.config.cookieDomain === 'string' ) {
			// Explicit domain cookie, preferred way
			options.domain = this.config.cookieDomain;
		}
		// Else: use whatever is the default

		// At this point, the translator saw the license agreement.
		mw.cookie.set( name, true, options );
	};
}( jQuery, mediaWiki ) );
