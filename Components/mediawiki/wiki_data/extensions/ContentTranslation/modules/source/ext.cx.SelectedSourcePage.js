/*!
 * SelectedSourcePage - widget that displays selected page info:
 * - title
 * - image
 * - number of different language versions
 * - weekly page views count
 * and language selector that allows to change source and target language before starting the translation.
 *
 * @copyright See AUTHORS.txt
 * @license GPL-2.0-or-later
 */
( function ( $, mw ) {
	'use strict';

	/**
	 * SelectedSourcePage
	 *
	 * @class
	 * @param {mw.cx.SiteMapper} siteMapper
	 * @param {Object} config
	 * @cfg {Function} [onDiscard] Callback triggered after selected source page is discarded
	 */
	mw.cx.SelectedSourcePage = function ( siteMapper, config ) {
		this.siteMapper = siteMapper;
		this.config = $.extend( {}, config );

		this.onDiscard = this.config.onDiscard;
		this.sourceTitle = null;
		this.targetTitle = null;
		// this.sourcePageTitles are titles of the selected source page in different languages
		this.sourcePageTitles = {};

		this.$element = null;

		this.$selectedSourcePageImage = null;
		this.$selectedSourcePageLink = null;
		this.$selectedSourcePageLanguageCount = null;
		this.$selectedSourcePageViewsCount = null;
		this.languageFilter = null;
		this.discardButton = null;
		this.startTranslationButton = null;
		this.$messageBar = null;
		this.$messageText = null;

		this.init();
	};

	mw.cx.SelectedSourcePage.prototype.init = function () {
		this.validator = new mw.cx.ContentTranslationValidator( this.siteMapper );

		this.languageFilter = new mw.cx.ui.LanguageFilter( {
			onSourceLanguageChange: this.sourceLanguageChangeHandler.bind( this ),
			onTargetLanguageChange: this.targetLanguageChangeHandler.bind( this )
		} );
		this.discardButton = new OO.ui.ButtonWidget( {
			framed: false,
			icon: 'close',
			classes: [ 'cx-selected-source-page__discard' ]
		} );

		this.render();
		this.listen();
	};

	mw.cx.SelectedSourcePage.prototype.render = function () {
		var $selectedSourcePageLinkContainer,
			$selectedSourcePageContainer,
			$selectedSourcePageInfo,
			$selectedSourcePageMetrics,
			$license,
			$actions,
			translateButtonLabel;

		this.$selectedSourcePageImage = $( '<div>' )
			.addClass( 'cx-selected-source-page__image' );

		this.$selectedSourcePageLink = $( '<a>' )
			.addClass( 'cx-selected-source-page__link' );
		$selectedSourcePageLinkContainer = $( '<span>' )
			.append( this.$selectedSourcePageLink );

		this.$selectedSourcePageLanguageCount = $( '<span>' )
			.addClass( 'cx-selected-source-page__language-count' );
		this.$selectedSourcePageViewsCount = $( '<span>' )
			.addClass( 'cx-selected-source-page__views-count' );
		$selectedSourcePageMetrics = $( '<div>' )
			.addClass( 'cx-selected-source-page__metrics' )
			.append( this.$selectedSourcePageLanguageCount, this.$selectedSourcePageViewsCount );

		$selectedSourcePageInfo = $( '<div>' )
			.addClass( 'cx-selected-source-page__info' )
			.append( $selectedSourcePageLinkContainer, $selectedSourcePageMetrics );

		$selectedSourcePageContainer = $( '<div>' )
			.addClass( 'cx-selected-source-page__container' )
			.append(
				this.$selectedSourcePageImage,
				$selectedSourcePageInfo,
				this.languageFilter.$element,
				this.discardButton.$element
			);

		this.$messageBar = $( '<div>' )
			.addClass( 'cx-selected-source-page__messagebar' );
		this.$messageText = $( '<span>' )
			.addClass( 'cx-selected-source-page__messagebar-text' );
		this.$messageBar
			.append( this.$messageText )
			.hide();

		translateButtonLabel = mw.msg( 'cx-selected-source-page-start-translation-button' );
		this.startTranslationButton = new OO.ui.ButtonWidget( {
			flags: [ 'primary', 'progressive' ],
			label: translateButtonLabel
		} );

		$license = $( '<div>' )
			.addClass( 'cx-selected-source-page__license' )
			.html( mw.message( 'cx-license-agreement', translateButtonLabel ).parse() );

		$actions = $( '<div>' )
			.addClass( 'cx-selected-source-page__actions' )
			.append( this.startTranslationButton.$element );

		this.$element = $( '<div>' )
			.addClass( 'cx-selected-source-page' )
			.append(
				$selectedSourcePageContainer,
				this.$messageBar,
				$license,
				$actions
			);
	};

	mw.cx.SelectedSourcePage.prototype.toggleModal = function () {
		var self = this;

		this.$element
			.addClass( 'cx-selected-source-page--modal' )
			.on( 'keydown', function ( e ) {
				if ( e.keyCode === OO.ui.Keys.ESCAPE ) {
					self.discardDialog();
				}
			} );
	};

	mw.cx.SelectedSourcePage.prototype.hide = function () {
		this.$element.remove();
	};

	mw.cx.SelectedSourcePage.prototype.focusStartTranslationButton = function () {
		this.startTranslationButton.$button.focus();
	};

	mw.cx.SelectedSourcePage.prototype.listen = function () {
		this.startTranslationButton.connect( this, { click: this.startPageInCX } );
		this.discardButton.connect( this, { click: this.discardDialog } );
	};

	mw.cx.SelectedSourcePage.prototype.discardDialog = function () {
		this.$messageBar.hide(); // Hide any previous messages

		// Discard selected source image
		this.$selectedSourcePageImage
			.removeAttr( 'style' )
			.removeClass( 'oo-ui-iconElement-icon' )
			.attr( 'class', function ( i, className ) {
				return className.replace( /(?:^|\s)oo-ui-icon-page-\S+/, '' );
			} );

		// Reset source titles, as there is no selected source
		this.sourcePageTitles = {};
		// Reset source and target ULS to show all source and target languages
		this.languageFilter.fillSourceLanguages( null, true );
		this.languageFilter.fillTargetLanguages( null, true );

		$( 'html' ).click(); // Not sure why click doesn't pass through OOUI button to HTML element
		// where listener is closing the ULS on outside clicks. Maybe some OOUI change?

		if ( this.onDiscard ) {
			this.onDiscard();
		}
	};

	/**
	 * Change the title of selected source page to title in other language
	 *
	 * @param {string} language Language code
	 */
	mw.cx.SelectedSourcePage.prototype.changeSelectedSourceTitle = function ( language ) {
		var href, title = this.sourcePageTitles[ language ];

		if ( title ) {
			href = this.siteMapper.getPageUrl( language, title );
			this.$selectedSourcePageLink.prop( {
				href: href,
				title: title,
				text: title
			} ).toggleClass( 'cx-selected-source-page__link--long', title.length >= 60 );
			this.sourceTitle = title;
		}
	};

	/**
	 * Handles source language change.
	 *
	 * @param {string} language Language code.
	 */
	mw.cx.SelectedSourcePage.prototype.sourceLanguageChangeHandler = function ( language ) {
		var self = this;

		this.changeSelectedSourceTitle( language );
		this.getPageInfo( this.sourcePageTitles[ language ] ).done( function ( data ) {
			self.renderPageViews( data.pageviews );
		} ).fail( function ( error ) {
			mw.log( 'Error getting page info for ' + self.sourcePageTitles[ language ] + '. ' + error );
		} );

		this.check();
	};

	mw.cx.SelectedSourcePage.prototype.setSourceTitle = function ( sourceTitle ) {
		this.sourceTitle = sourceTitle;
	};

	/**
	 * Handles target language change.
	 *
	 * @param {string} language Language code.
	 */
	mw.cx.SelectedSourcePage.prototype.targetLanguageChangeHandler = function () {
		this.check();
	};

	mw.cx.SelectedSourcePage.prototype.setTargetTitle = function ( targetTitle ) {
		this.targetTitle = targetTitle;
	};

	/**
	 * Sets all the info for selected page
	 * @param {string} pageTitle
	 * @param {string} href
	 * @param {Object} config
	 * @cfg {string} sourceLanguage Source language code
	 * @cfg {string} targetLanguage Target language code
	 * @cfg {Object} [params] Parameters used for API call to get page info
	 * @cfg {string} [imageUrl] URL for selected source page image
	 * @cfg {string} [imageIcon] OOUI class of selected page placeholder icon
	 * @cfg {Number} [numOfLanguages] Number of different language versions for selected source page
	 */
	mw.cx.SelectedSourcePage.prototype.setSelectedSourcePageData = function ( pageTitle, href, config ) {
		var params, self = this;
		this.languageFilter.setSourceLanguageNoChecks( config.sourceLanguage );
		this.languageFilter.setTargetLanguageNoChecks( config.targetLanguage );

		params = $.extend( {
			prop: [ 'langlinks', 'pageviews' ],
			redirects: 1,
			lllimit: 'max'
		}, config.params );

		this.getPageInfo( pageTitle, params ).done( function ( data ) {
			var langCode, title, languagesPageExistsIn, languageDecorator, numOfLanguages;

			self.renderPageViews( data.pageviews );

			numOfLanguages =
				config.numOfLanguages ||
				( OO.getProp( data, 'langlinkscount' ) || 0 ) + 1;
			self.$selectedSourcePageLanguageCount.text( mw.language.convertNumber( numOfLanguages ) );

			// Reset source page titles
			self.sourcePageTitles = {};
			// Extract results data and create sourcePageTitles mapping
			$.each( data.langlinks, ( function ( index, element ) {
				langCode = element.lang;
				title = element[ '*' ];

				self.sourcePageTitles[ langCode ] = title;
			} ) );
			// Include chosen source page title (not returned by langlinks API)
			self.sourcePageTitles[ self.languageFilter.getSourceLanguage() ] = pageTitle;

			languagesPageExistsIn = Object.keys( self.sourcePageTitles );
			languageDecorator = function ( $language, languageCode ) {
				if ( languagesPageExistsIn.indexOf( languageCode ) < 0 ) {
					$language.css( 'font-weight', 'bold' );
				}
			};

			self.languageFilter.fillSourceLanguages( languagesPageExistsIn, true );
			self.languageFilter.fillTargetLanguages( null, true, {
				languageDecorator: languageDecorator
			} );
			self.languageFilter.setValidSourceLanguages( languagesPageExistsIn );
		} ).fail( function ( error ) {
			mw.log( 'Error getting page info for ' + pageTitle + '. ' + error );
		} );

		if ( config.imageUrl ) {
			this.$selectedSourcePageImage.css( 'background-image', 'url( ' + config.imageUrl + ')' );
		} else {
			this.$selectedSourcePageImage.addClass( 'oo-ui-iconElement-icon oo-ui-icon-' + config.imageIcon );
		}

		this.$selectedSourcePageLink.prop( {
			href: href,
			title: pageTitle,
			target: '_blank',
			text: pageTitle
		} );
		this.$selectedSourcePageLink.toggleClass( 'cx-selected-source-page__link--long', pageTitle.length >= 60 );

		this.sourceTitle = pageTitle;
		this.check();
	};

	/**
	 * Gets data for the selected page.
	 * Gets pageviews by default, and langlinks if specified through optional params.
	 *
	 * @param {string} title Title of the page for which data is fetched.
	 * @param {Object} [params] Optional parameter used for fetching additional source data.
	 * @return {jQuery.Promise} Returns thenable promise, so langlinks can be processed if necessary.
	 */
	mw.cx.SelectedSourcePage.prototype.getPageInfo = function ( title, params ) {
		var api, self = this;

		if ( !title ) {
			throw new Error( 'Title is mandatory parameter' );
		}

		api = this.siteMapper.getApi( this.languageFilter.getSourceLanguage() );
		params = $.extend( {
			action: 'query',
			// If new prop array is provided in params, this one is overridden
			prop: [ 'pageviews' ],
			titles: title,
			pvipdays: 7
		}, params );

		return api.get( params ).then( function ( data ) {
			var pageId,
				page = OO.getProp( data, 'query', 'pages' );

			if ( !page ) {
				return $.Deferred().reject( 'No page data' ).promise();
			}

			// Only one title was passed in titles params, so we expect one result
			pageId = Object.keys( page )[ 0 ];
			if ( pageId === '-1' ) {
				// Page does not exist
				return $.Deferred().reject( 'Requested page does not exist' ).promise();
			}

			return page[ pageId ];
		}, function ( response ) {
			// In case of failure, fallback to all source and target languages
			self.sourcePageTitles = {};
			self.languageFilter.fillSourceLanguages( null, true );
			self.languageFilter.fillTargetLanguages( null, true );

			return $.Deferred().reject( 'Reason: ' + response ).promise();
		} );
	};

	mw.cx.SelectedSourcePage.prototype.renderPageViews = function ( pageViewData ) {
		var date, pageViews = 0;

		if ( !pageViewData ) {
			return;
		}

		for ( date in pageViewData ) {
			pageViews += pageViewData[ date ];
		}

		this.$selectedSourcePageViewsCount.text(
			mw.msg( 'cx-selected-source-page-view-count', mw.language.convertNumber( pageViews ) )
		);
	};

	/**
	 * Start a new page translation in Special:CX.
	 */
	mw.cx.SelectedSourcePage.prototype.startPageInCX = function () {
		var targetTitle, originalSourceTitle, sourceLanguage, targetLanguage, siteMapper, self = this;

		siteMapper = this.siteMapper;
		sourceLanguage = this.languageFilter.getSourceLanguage();
		targetLanguage = this.languageFilter.getTargetLanguage();
		originalSourceTitle = this.sourceTitle;
		targetTitle = this.targetTitle || '';

		this.validator.isTitleExistInLanguage(
			sourceLanguage,
			originalSourceTitle
		).done( function ( sourceTitle ) {
			if ( targetTitle === '' ) {
				targetTitle = mw.cx.getTitleForNamespace(
					originalSourceTitle, mw.cx.getDefaultTargetNamespace()
				);
			}

			// Set CX token as cookie.
			siteMapper.setCXToken( sourceLanguage, targetLanguage, sourceTitle );

			location.href = siteMapper.getCXUrl(
				sourceTitle,
				targetTitle,
				sourceLanguage,
				targetLanguage,
				{ campaign: self.config.campaign }
			);
		} );
	};

	/**
	 * Checks selected source page for problems with chosen source and target language pair.
	 */
	mw.cx.SelectedSourcePage.prototype.check = function () {
		var sourceLanguage = this.languageFilter.getSourceLanguage(),
			targetLanguage = this.languageFilter.getTargetLanguage(),
			targetTitle = this.targetTitle || '',
			titleCheck, translationCheck,
			self = this;

		this.$messageBar.hide();

		// Whether the target title, if given, exists in the target wiki
		titleCheck = this.validator.isTitleExistInLanguage( targetLanguage, targetTitle );
		// Whether the source already has a translation linked via language links
		translationCheck = this.validator.isTitleConnectedInLanguages(
			sourceLanguage,
			targetLanguage,
			this.sourceTitle
		);

		$.when(
			translationCheck,
			titleCheck
		).done( function ( existingTranslation, existingTargetTitle ) {
			// If there is an existing translation and
			// the specified target title is in use
			if ( existingTranslation && existingTargetTitle ) {
				self.showPageExistsAndTitleInUseError(
					existingTranslation,
					existingTargetTitle,
					targetLanguage
				);
			} else if ( existingTranslation ) {
				// If there is just an existing translation
				self.showPageExistsError( existingTranslation, targetLanguage );
			} else if ( existingTargetTitle ) {
				// If the specified target title is in use
				self.showTitleInUseError( existingTargetTitle, targetLanguage );
			}
		} );
	};

	/**
	 * Shows error for target page existing and target title in use.
	 *
	 * @param {string} equivalentTargetPage the title of the existing page
	 * @param {string} existingTargetTitle the title already in use
	 * @param {string} targetLanguage
	 */
	mw.cx.SelectedSourcePage.prototype.showPageExistsAndTitleInUseError = function (
		equivalentTargetPage,
		existingTargetTitle,
		targetLanguage
	) {
		var equivalentTargetPageLink, targetLanguageDisplay,
			existingTargetTitleLink, message;

		equivalentTargetPageLink = this.siteMapper.getPageUrl( targetLanguage, equivalentTargetPage );
		targetLanguageDisplay = $.uls.data.getAutonym( targetLanguage );

		existingTargetTitleLink = this.siteMapper.getPageUrl( targetLanguage, existingTargetTitle );

		message = mw.message(
			'cx-selected-source-page-error-page-and-title-exist',
			equivalentTargetPageLink,
			targetLanguageDisplay,
			existingTargetTitleLink
		);

		this.showMessage( message );
	};

	/**
	 * Shows error for page already existing in target.
	 *
	 * @param {string} equivalentTargetPage the title of the existing page
	 * @param {string} targetLanguage
	 */
	mw.cx.SelectedSourcePage.prototype.showPageExistsError = function ( equivalentTargetPage, targetLanguage ) {
		var equivalentTargetPageLink, targetLanguageDisplay, message;

		equivalentTargetPageLink = this.siteMapper.getPageUrl( targetLanguage, equivalentTargetPage );
		targetLanguageDisplay = $.uls.data.getAutonym( targetLanguage );

		message = mw.message(
			'cx-selected-source-page-error-page-exists',
			equivalentTargetPageLink, targetLanguageDisplay
		);

		this.showMessage( message );
	};

	/**
	 * Shows error for title already in use in target wiki.
	 *
	 * @param {string} existingTargetTitle The title already in use
	 * @param {string} targetLanguage
	 */
	mw.cx.SelectedSourcePage.prototype.showTitleInUseError = function ( existingTargetTitle, targetLanguage ) {
		var existingTargetTitleLink, message;

		existingTargetTitleLink = this.siteMapper.getPageUrl( targetLanguage, existingTargetTitle );

		message = mw.message(
			'cx-selected-source-page-error-title-in-use',
			existingTargetTitleLink
		);

		this.showMessage( message );
	};

	/**
	 * Shows error message for dialog.
	 *
	 * @param {mw.Message|text} message the message to show
	 */
	mw.cx.SelectedSourcePage.prototype.showMessage = function ( message ) {
		if ( message instanceof mw.Message ) {
			this.$messageText.html( message.parse() );
		} else {
			this.$messageText.text( message );
		}

		this.$messageBar.find( 'a' )
			.attr( 'target', '_blank' );

		this.$messageBar.show();
	};
}( jQuery, mediaWiki ) );
