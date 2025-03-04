/*!
 * ContentTranslation extension - Translation listing in dashboard.
 *
 * @copyright See AUTHORS.txt
 * @license GPL-2.0-or-later
 */
( function ( $, mw ) {
	'use strict';

	/**
	 * CXTranslationList
	 *
	 * @class
	 * @param {jQuery} $container
	 * @param {string} type
	 * @param {mw.cx.SiteMapper} siteMapper
	 */
	function CXTranslationList( $container, type, siteMapper ) {
		this.$container = $container;
		this.type = type;
		this.siteMapper = siteMapper;

		this.pendingRequests = 0;
		this.translations = [];
		// sourceLanguages and targetLanguages are arrays of languages,
		// for which there are translation list items
		this.sourceLanguages = [];
		this.targetLanguages = [];
		this.languageFilter = null;

		this.$headerContainer = null;
		this.$translationsList = null;
		this.$loadingIndicatorSpinner = null;
		this.active = false;
		this.promise = null;
		this.queryContinue = null;
		this.hasMore = true;

		this.init();
		this.listen();
	}

	/**
	 * Get all the translations of given user.
	 *
	 * @return {jQuery.Promise}
	 */
	CXTranslationList.prototype.getTranslations = function () {
		var self = this,
			params,
			api = new mw.Api();

		if ( this.promise ) {
			// Avoid duplicate API requests.
			return this.promise;
		}

		if ( this.hasMore === false ) {
			return $.Deferred().resolve( [] );
		}

		params = $.extend( {
			list: 'contenttranslation',
			type: this.type,
			limit: 15
		}, this.queryContinue );

		this.promise = api.get( params ).then( function ( response ) {
			self.promise = null;
			self.queryContinue = response.continue;
			self.hasMore = !!response.continue;
			if ( response.query.contenttranslation.languages ) {
				self.languages = response.query.contenttranslation.languages;
			}

			// Remove unnecessary object wrapping to get plain list of objects
			return $.map( response.query.contenttranslation.translations, function ( e ) {
				return e.translation;
			} );
		} );

		return this.promise;
	};

	CXTranslationList.prototype.init = function () {
		this.languageFilter = new mw.cx.ui.LanguageFilter( {
			canBeSame: true,
			canBeUndefined: true,
			updateLocalStorage: false,
			onSourceLanguageChange: this.applyFilters.bind( this ),
			onTargetLanguageChange: this.applyFilters.bind( this )
		} );

		this.$headerContainer = $( '<div>' )
			.addClass( 'cx-translationlist__header' )
			.append(
				$( '<span>' )
					.text( mw.msg( 'cx-translation-label-' + this.type ) ),
				this.languageFilter.$element.hide()
			);
		this.$loadingIndicatorSpinner = $( '<div>' )
			.addClass( 'cx-translationlist__loading-indicator' )
			.append( mw.cx.widgets.spinner() );
		this.$translationsList = $( '<div>' )
			.addClass( 'cx-translationlist' )
			.append( this.$headerContainer, this.$loadingIndicatorSpinner );

		this.$container.append( this.$translationsList, this.$emptyTranslationsList );
	};

	CXTranslationList.prototype.loadItems = function () {
		var promise, self = this;

		if ( this.promise ) {
			return this.promise;
		}

		function insertUnique( array, value ) {
			if ( array.indexOf( value ) < 0 ) {
				array.push( value );
			}
		}

		this.$loadingIndicatorSpinner.show();
		this.pendingRequests++;

		promise = this.getTranslations();
		promise.done( function ( translations ) {
			self.translations = self.translations.concat( translations );

			if ( !self.translations.length ) {
				self.$emptyTranslationsList = self.buildEmptyTranslationList();
				self.$translationsList.append( self.$emptyTranslationsList );
				return;
			}

			$.each( translations, function ( i, translation ) {
				insertUnique( self.sourceLanguages, translation.sourceLanguage );
				insertUnique( self.targetLanguages, translation.targetLanguage );
			} );

			self.fillULS();

			self.renderTranslations( translations );
		} ).fail( function () {
			self.promise = null;
		} ).always( function () {
			self.pendingRequests--;

			if ( self.pendingRequests === 0 ) {
				self.$loadingIndicatorSpinner.hide();
			}
		} );

		return promise;
	};

	/**
	 * Fill source and target language filter with languages for which there are translationlist items
	 */
	CXTranslationList.prototype.fillULS = function () {
		var languageDecorator;
		// Check if there is only one language combination, e.g. English to Spanish
		// sourceLanguages - [ 'en' ]
		// targetLanguages - [ 'es' ]
		if ( this.sourceLanguages.length === 1 && this.targetLanguages.length === 1 ) {
			return;
		}

		// At this point, we know there is more than one language combination

		this.sourceLanguages.unshift( 'x-all' );
		this.targetLanguages.unshift( 'x-all' );

		languageDecorator = function ( $language, languageCode ) {
			if ( languageCode === 'x-all' ) {
				$language.parent().addClass( 'cx-translationlist-uls-all-languages' );
			}
		};

		this.languageFilter.fillSourceLanguages( this.sourceLanguages, true, {
			languageDecorator: languageDecorator
		} );
		this.languageFilter.fillTargetLanguages( this.targetLanguages, true, {
			languageDecorator: languageDecorator
		} );

		this.languageFilter.$element.show();
	};

	/**
	 * Get the thumbnail image of the given link.
	 *
	 * @param {string} language
	 * @param {string} titles Title
	 * @return {jQuery.Promise}
	 */
	CXTranslationList.prototype.getLinkImages = function ( language, titles ) {
		return this.siteMapper.getApi( language ).get( {
			action: 'query',
			titles: titles,
			prop: 'pageimages',
			piprop: 'thumbnail',
			pilimit: 50, // maximum
			pithumbsize: 100,
			redirects: true
		} );

		// TODO: Handle continue
	};

	/**
	 * Show a title image of the translations based on source title.
	 *
	 * @param {Object[]} translations
	 */
	CXTranslationList.prototype.showTitleImages = function ( translations ) {
		var apply,
			self = this,
			queries = {},
			map = {};

		$.each( translations, function ( index, translation ) {
			var language = self.siteMapper.getWikiDomainCode( translation.sourceLanguage );

			queries[ language ] = queries[ language ] || [];
			queries[ language ].push( translation.sourceTitle );

			// So that we can easily find the element in the callback
			if ( !map[ translation.sourceTitle ] ) {
				// Same source title might be translated to multiple languages.
				map[ translation.sourceTitle ] = [];
			}
			map[ translation.sourceTitle ].push( translation.$image );
		} );

		apply = function ( page ) {
			if ( page.thumbnail ) {
				$.each( map[ page.title ], function ( i, $image ) {
					$image.removeClass( 'oo-ui-icon-page-existing' )
						.css( 'background-image', 'url(' + page.thumbnail.source + ')' );
				} );
			}
		};

		$.each( queries, function ( language, titles ) {
			self.getLinkImages( language, titles ).done( function ( response ) {
				var i,
					redirects = $.extend( {}, response.query.redirects ),
					pages = response.query.pages;

				$.each( pages, function ( pageId, page ) {
					for ( i in redirects ) {
						if ( redirects[ i ].to === page.title ) {
							page.title = redirects[ i ].from;
						}
					}
					apply( page );
				} );
			} );
		} );
	};

	CXTranslationList.prototype.show = function () {
		this.active = true;
		this.$translationsList.show();

		if ( !this.translations.length ) {
			this.loadItems();
		}
	};

	CXTranslationList.prototype.hide = function () {
		this.active = false;
		this.$translationsList.hide();
	};

	/**
	 * Go to translation view
	 *
	 * @param {Object} translation
	 */
	CXTranslationList.prototype.continueTranslation = function ( translation ) {
		if ( translation.status === 'deleted' ) {
			return;
		}

		// Set CX token as cookie.
		mw.cx.siteMapper.setCXToken(
			translation.sourceLanguage,
			translation.targetLanguage,
			translation.sourceTitle
		);
		location.href = new mw.Uri( mw.cx.siteMapper.getCXUrl(
			translation.sourceTitle,
			translation.targetTitle,
			translation.sourceLanguage,
			translation.targetLanguage,
			{ version: translation.cxVersion }
		) ).toString();
	};

	/**
	 * List all translations.
	 *
	 * @param {Object[]} translations
	 */
	CXTranslationList.prototype.renderTranslations = function ( translations ) {
		var i, translation, progress, $translation,
			$lastUpdated, $image, $progressbar,
			sourceDir, targetDir, $targetTitle,
			$translationLink,
			$sourceLanguage, $targetLanguage, $languageContainer,
			deleteTranslation, $actions,
			continueTranslation,
			$titleLanguageBlock,
			$translations = [];

		for ( i = 0; i < translations.length; i++ ) {
			translation = translations[ i ];

			try {
				progress = JSON.parse( translation.progress );
			} catch ( e ) {
				progress = {};
			}

			$translation = $( '<div>' )
				.addClass( 'cx-tlitem' )
				.data( 'translation', translation );
			$lastUpdated = $( '<div>' )
				.addClass( 'last-updated' )
				.text( moment( translation.lastUpdateTimestamp, 'YYYYMMDDHHmmss Z' ).fromNow() );
			$image = $( '<div>' )
				.addClass( 'cx-tlitem__image oo-ui-icon-page-existing' );
			$progressbar = $( '<div>' )
				.addClass( 'progressbar' )
				.cxProgressBar( {
					weights: progress
				} );

			sourceDir = $.uls.data.getDir( translation.sourceLanguage );
			targetDir = $.uls.data.getDir( translation.targetLanguage );

			$translationLink = $( '<a>' )
				.addClass( 'translation-link' )
				// It must be a separate element to ensure
				// separation from the target title
				.append( $( '<span>' )
					.text( translation.sourceTitle )
					.addClass( 'source-title' )
					.prop( {
						lang: translation.sourceLanguage,
						dir: sourceDir
					} )
				);

			// If the translated title is different from the source title,
			// show it near the source title
			if ( translation.sourceTitle !== translation.targetTitle ) {
				$targetTitle = $( '<span>' )
					.prop( {
						lang: translation.targetLanguage,
						dir: targetDir
					} )
					.addClass( 'target-title' )
					.text( translation.targetTitle );
				$translationLink.append(
					$( '<span>' ).html( '&#160;' ), // nbsp to ensure separation between words
					$targetTitle
				);
			}

			$sourceLanguage = $( '<div>' )
				.prop( {
					lang: translation.sourceLanguage,
					dir: sourceDir
				} )
				.addClass( 'cx-tlitem__languages__language cx-tlitem__languages__language--source' )
				.text( $.uls.data.getAutonym( translation.sourceLanguage ) );

			$targetLanguage = $( '<div>' )
				.prop( {
					lang: translation.targetLanguage,
					dir: targetDir
				} )
				.addClass( 'cx-tlitem__languages__language cx-tlitem__languages__language--target' )
				.text( $.uls.data.getAutonym( translation.targetLanguage ) );

			$languageContainer = $( '<div>' )
				.addClass( 'cx-tlitem__languages' )
				.append( $sourceLanguage, $targetLanguage );

			$actions = $( '<div>' )
				.addClass( 'cx-tlitem__actions' );
			// If the translation is draft, allow deleting it
			if ( translation.status === 'draft' ) {
				deleteTranslation = new OO.ui.ButtonWidget( {
					framed: false,
					classes: [ 'cx-discard-translation' ],
					icon: 'trash',
					title: mw.msg( 'cx-discard-translation' )
				} );
				$actions.append( deleteTranslation.$element );
			} else if ( translation.status === 'published' ) {
				continueTranslation = new OO.ui.ButtonWidget( {
					framed: false,
					classes: [ 'cx-continue-translation' ],
					icon: 'edit',
					title: mw.msg( 'cx-continue-translation' )
				} );
				$actions.append( continueTranslation.$element );
			}

			$titleLanguageBlock = $( '<div>' )
				.addClass( 'cx-tlitem__details' )
				.append( $translationLink, $progressbar, $lastUpdated, $languageContainer );

			$translation.append(
				$image,
				$titleLanguageBlock,
				$actions
			);

			$translations.push( $translation );

			// Store reference to the DOM nodes
			translation.$element = $translation;
			translation.$image = $image;
		}

		this.$translationsList.append( $translations );
		this.showTitleImages( translations );
	};

	CXTranslationList.prototype.buildEmptyTranslationList = function () {
		var $img, $title, $desc;

		if ( this.$emptyTranslationsList ) {
			return this.$emptyTranslationsList;
		}
		$img = $( '<div>' )
			.addClass( 'cx-translationlist-empty__img' );
		$title = $( '<div>' )
			.addClass( 'cx-translationlist-empty__title' )
			.text( mw.msg( 'cx-translationlist-empty-title' ) );
		$desc = $( '<div>' )
			.addClass( 'cx-translationlist-empty__desc' )
			.text( mw.msg( 'cx-translationlist-empty-desc' ) );
		return $( '<div>' )
			.addClass( 'cx-translationlist-empty' )
			.append(
				$img, $title, $desc
			);
	};

	CXTranslationList.prototype.listen = function () {
		var self = this,
			scrollHandler;

		this.$translationsList.on( 'click', '.cx-discard-translation', function ( e ) {
			var translation;

			e.stopPropagation();
			$( this ).find( 'a' ).blur();
			translation = $( this ).closest( '.cx-tlitem' ).data( 'translation' );

			OO.ui.getWindowManager().openWindow( 'message', $.extend( {
				message: mw.msg( 'cx-draft-discard-confirmation-message' ),
				actions: [
					{ action: 'discard', label: mw.msg( 'cx-draft-discard-button-label' ), flags: [ 'primary', 'destructive' ] },
					{ action: 'cancel', label: mw.msg( 'cx-draft-cancel-button-label' ), flags: 'safe' }
				]
			} ) ).closed.then( function ( data ) {
				if ( data && data.action === 'discard' ) {
					self.discardTranslation( translation ).done( function ( response ) {
						if ( response.cxdelete.result !== 'success' ) {
							return;
						}
						translation.status = 'deleted';
						self.markTranslationAsDeleted( translation );
						mw.hook( 'mw.cx.translation.deleted' ).fire(
							translation.sourceLanguage,
							translation.targetLanguage,
							translation.sourceTitle,
							translation.targetTitle
						);
					} );
				}
			} );
		} );

		this.$translationsList.on( 'click', '.cx-continue-translation', function ( e ) {
			var translation;

			e.stopPropagation();
			$( this ).find( 'a' ).blur();
			translation = $( this ).closest( '.cx-tlitem' ).data( 'translation' );
			self.continueTranslation( translation );
			return false;
		} );

		this.$translationsList.on( 'click', '.cx-tlitem', function () {
			var translation = $( this ).data( 'translation' );
			if ( translation.status === 'published' ) {
				location.href = translation.targetURL;
			} else {
				self.continueTranslation( translation );
			}
		} );

		// Attach a scroll handler
		scrollHandler = $.throttle( 250, this.scroll.bind( this ) );
		$( window ).scroll( scrollHandler );
	};

	CXTranslationList.prototype.scroll = function () {
		var scrollTop, windowHeight;
		if ( !this.active ) {
			return;
		}
		scrollTop = window.pageYOffset;
		windowHeight = document.documentElement.clientHeight;

		// Load next batch of items on scroll.
		if ( scrollTop > 0 && scrollTop + windowHeight + 100 > $( document ).height() ) {
			this.loadItems();
		}
	};

	/**
	 * Mark the translation item in the translation list as deleted.
	 *
	 * @param {Object} translation
	 */
	CXTranslationList.prototype.markTranslationAsDeleted = function ( translation ) {
		translation.$element
			.addClass( 'cx-translation-deleted' )
			.find( '.status' )
			.removeClass( 'status-draft status-published' )
			.addClass( 'status-deleted' )
			.text( mw.msg( 'cx-translation-status-deleted' ) )
			.end()
			.find( '.cx-tlitem__actions' )
			.remove()
			.end()
			.find( '.translation-link' )
			.addClass( 'disabled' );
	};

	/**
	 * Discard a translation.
	 *
	 * @param {Object} translation
	 * @return {jQuery.Promise}
	 */
	CXTranslationList.prototype.discardTranslation = function ( translation ) {
		var apiParams = {
			action: 'cxdelete',
			from: translation.sourceLanguage,
			to: translation.targetLanguage,
			sourcetitle: translation.sourceTitle
		};

		return new mw.Api().postWithToken( 'csrf', apiParams );
	};

	CXTranslationList.prototype.applyFilters = function () {
		var i, translation, visible,
			sourceLanguage = this.languageFilter.getSourceLanguage(),
			targetLanguage = this.languageFilter.getTargetLanguage();

		for ( i = 0; i < this.translations.length; i++ ) {
			translation = this.translations[ i ];

			visible = ( !sourceLanguage || translation.sourceLanguage === sourceLanguage ) &&
				( !targetLanguage || translation.targetLanguage === targetLanguage );

			if ( visible ) {
				translation.$element.show();
			} else {
				translation.$element.hide();
			}
		}
	};

	mw.cx.CXTranslationList = CXTranslationList;
}( jQuery, mediaWiki ) );
